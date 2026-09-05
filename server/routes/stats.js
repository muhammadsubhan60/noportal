const express = require('express');
const mongoose = require('mongoose');
const { authenticateToken } = require('../middleware/auth');
const User        = require('../models/User');
const Label       = require('../models/Label');
const ManifestJob = require('../models/ManifestJob');
const Vendor      = require('../models/Vendor');
const Balance     = require('../models/Balance');
const { getUspsZone1Rate } = require('../utils/uspsRates');
const { NORMALIZED_TS_EXPR, tallyStatusCounts } = require('../utils/trackingStatus');

const router = express.Router();

// GET /api/stats  — role-aware stats
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { role, _id: userId } = req.user;
    if (role === 'admin')    return res.json(await adminStats());
    if (role === 'reseller') return res.json(await resellerStats(userId));
    return res.json(await userStats(userId));
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ message: 'Error fetching stats' });
  }
});

// ── Admin ─────────────────────────────────────────────────────────────────────
async function adminStats() {
  const now           = new Date();
  const startOfMonth  = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfToday  = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [
    userGroups,
    newThisMonth,
    labelGroups,
    labelsToday,
    manifestGroups,
    vendorGroups,
    totalBalanceHeld,
    recentManifests,
    recentUsers,
    trackingStatusGroups,
  ] = await Promise.all([
    // Users by role + isActive
    User.aggregate([
      { $group: { _id: { role: '$role', active: '$isActive' }, count: { $sum: 1 } } },
    ]),
    // New users this month
    User.countDocuments({ createdAt: { $gte: startOfMonth } }),
    // Labels by carrier + status
    Label.aggregate([
      { $group: { _id: { carrier: '$carrier', status: '$status' }, count: { $sum: 1 }, revenue: { $sum: '$price' } } },
    ]),
    // Labels generated today
    Label.countDocuments({ createdAt: { $gte: startOfToday }, status: 'generated' }),
    // Manifest jobs by status
    ManifestJob.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 }, revenue: { $sum: '$userBilling.totalAmount' } } },
    ]),
    // Active vendors + payables
    Vendor.aggregate([
      { $group: { _id: '$isActive', count: { $sum: 1 }, dueBalance: { $sum: '$dueBalance' }, totalEarnings: { $sum: '$totalEarnings' } } },
    ]),
    // Sum all user balances
    Balance.aggregate([
      { $group: { _id: null, total: { $sum: '$currentBalance' } } },
    ]),
    // Manifest jobs needing admin action
    ManifestJob.find({ status: 'open' })
      .populate('user', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .limit(8)
      .select('carrier status userBilling user createdAt'),
    // Recent signups
    User.find().sort({ createdAt: -1 }).limit(6).select('firstName lastName email role isActive createdAt'),
    // Tracking status breakdown across all generated labels (platform-wide)
    Label.aggregate([
      { $match: { status: 'generated' } },
      { $group: { _id: NORMALIZED_TS_EXPR, count: { $sum: 1 } } },
    ]),
  ]);

  // --- process user groups ---
  const users = { total: 0, admin: 0, reseller: 0, user: 0, active: 0, inactive: 0, newThisMonth };
  for (const g of userGroups) {
    users.total += g.count;
    users[g._id.role] = (users[g._id.role] || 0) + g.count;
    if (g._id.active) users.active += g.count;
    else users.inactive += g.count;
  }

  // --- process label groups ---
  const labels = { total: 0, generated: 0, failed: 0, revenue: 0, today: labelsToday, byCarrier: {} };
  for (const g of labelGroups) {
    labels.total    += g.count;
    labels.revenue  += g.revenue || 0;
    if (g._id.status === 'generated') labels.generated += g.count;
    if (g._id.status === 'failed')    labels.failed    += g.count;
    const c = g._id.carrier || 'Other';
    labels.byCarrier[c] = (labels.byCarrier[c] || 0) + g.count;
  }

  // --- process manifest groups ---
  const manifests = { total: 0, active: 0, completed: 0, cancelled: 0, revenue: 0, byStatus: {} };
  for (const g of manifestGroups) {
    manifests.total   += g.count;
    manifests.revenue += g.revenue || 0;
    manifests.byStatus[g._id] = g.count;
    if (g._id === 'open')      manifests.active    += g.count;
    if (g._id === 'completed') manifests.completed += g.count;
    if (g._id === 'cancelled') manifests.cancelled += g.count;
  }

  // --- process vendor groups ---
  const vendors = { active: 0, inactive: 0, dueBalance: 0, totalEarnings: 0 };
  for (const g of vendorGroups) {
    if (g._id === true) { vendors.active = g.count; vendors.dueBalance = g.dueBalance; vendors.totalEarnings = g.totalEarnings; }
    else vendors.inactive = g.count;
  }

  // --- tracking status breakdown + derived rates ---
  const statusCounts = tallyStatusCounts(trackingStatusGroups);
  const trackedTotal = Object.values(statusCounts).reduce((a, b) => a + b, 0);
  const pct = (n) => trackedTotal > 0 ? Math.round((n / trackedTotal) * 1000) / 10 : 0;
  const rates = {
    deliveryRate:       pct(statusCounts.delivered),
    scanningRate:       trackedTotal > 0 ? Math.round(((trackedTotal - statusCounts.not_scanned_yet) / trackedTotal) * 1000) / 10 : 0,
    // "Unpaid Postage" is surfaced by USPS as a scan exception, so it's tracked
    // under the Exception/Problem status rather than its own value.
    unpaidPostageRate:  pct(statusCounts.exception_problem),
  };

  return {
    users,
    labels,
    manifests,
    vendors,
    totalBalanceHeld: totalBalanceHeld[0]?.total || 0,
    totalRevenue: labels.revenue + manifests.revenue,
    recentManifests,
    recentUsers,
    trackingStatus: statusCounts,
    trackingStatusTotal: trackedTotal,
    rates,
  };
}

// ── Reseller ──────────────────────────────────────────────────────────────────
async function resellerStats(userId) {
  const me = await User.findById(userId).select('clients');
  const clientIds = (me?.clients || []).map(id => new mongoose.Types.ObjectId(String(id)));

  const [
    clients,
    myBalance,
    labelGroups,
    manifestGroups,
  ] = await Promise.all([
    User.find({ _id: { $in: clientIds } }).select('firstName lastName email isActive createdAt').sort({ createdAt: -1 }),
    Balance.getOrCreateBalance(userId),
    Label.aggregate([
      { $match: { user: { $in: clientIds } } },
      { $group: { _id: { carrier: '$carrier' }, count: { $sum: 1 }, revenue: { $sum: '$price' } } },
    ]),
    ManifestJob.aggregate([
      { $match: { user: { $in: clientIds } } },
      { $group: { _id: '$status', count: { $sum: 1 }, revenue: { $sum: '$userBilling.totalAmount' } } },
    ]),
  ]);

  const labelTotals = { total: 0, revenue: 0, byCarrier: {} };
  for (const g of labelGroups) {
    labelTotals.total   += g.count;
    labelTotals.revenue += g.revenue || 0;
    labelTotals.byCarrier[g._id.carrier || 'Other'] = g.count;
  }

  const manifestTotals = { total: 0, active: 0, completed: 0, revenue: 0 };
  for (const g of manifestGroups) {
    manifestTotals.total   += g.count;
    manifestTotals.revenue += g.revenue || 0;
    if (g._id === 'open')      manifestTotals.active    += g.count;
    if (g._id === 'completed') manifestTotals.completed += g.count;
  }

  // compute totals from Balance transactions
  const txns      = myBalance.transactions || [];
  const deposited = txns.filter(t => t.type === 'topup').reduce((s, t) => s + t.amount, 0);
  const spent     = txns.filter(t => t.type === 'deduction').reduce((s, t) => s + t.amount, 0);

  return {
    clientCount:    clientIds.length,
    activeClients:  clients.filter(c => c.isActive).length,
    myBalance: {
      currentBalance: myBalance.currentBalance,
      totalDeposited: deposited,
      totalSpent:     spent,
    },
    labels:    labelTotals,
    manifests: manifestTotals,
    totalClientSpend: labelTotals.revenue + manifestTotals.revenue,
    recentClients: clients.slice(0, 6),
  };
}

// ── Regular User ──────────────────────────────────────────────────────────────
async function userStats(userId) {
  const uid = new mongoose.Types.ObjectId(String(userId));

  const [
    labelGroups,
    manifestGroups,
    balance,
    recentLabels,
    activeManifests,
    uspsLabels,
    trackingStatusGroups,
  ] = await Promise.all([
    Label.aggregate([
      { $match: { user: uid } },
      { $group: { _id: { carrier: '$carrier', status: '$status' }, count: { $sum: 1 }, spent: { $sum: '$price' } } },
    ]),
    ManifestJob.aggregate([
      { $match: { user: uid } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Balance.getOrCreateBalance(userId),
    Label.find({ user: userId }).sort({ createdAt: -1 }).limit(5)
      .select('carrier vendorName trackingId price status createdAt isBulk bulkJobId'),
    ManifestJob.find({ user: userId, status: 'open' })
      .sort({ createdAt: -1 })
      .limit(4)
      .select('carrier status userBilling createdAt'),
    // USPS non-manifested generated labels for savings calculation
    Label.find({ user: uid, carrier: 'USPS', isBulk: false, status: 'generated' })
      .select('weight price').lean(),
    // Tracking status breakdown
    Label.aggregate([
      { $match: { user: uid, status: 'generated' } },
      { $group: { _id: '$trackingStatus', count: { $sum: 1 } } },
    ]),
  ]);

  const labels = { total: 0, generated: 0, failed: 0, spent: 0, byCarrier: {} };
  for (const g of labelGroups) {
    labels.total += g.count;
    labels.spent += g.spent || 0;
    if (g._id.status === 'generated') labels.generated += g.count;
    if (g._id.status === 'failed')    labels.failed    += g.count;
    const c = g._id.carrier || 'Other';
    labels.byCarrier[c] = (labels.byCarrier[c] || 0) + g.count;
  }

  const manifests = { total: 0, active: 0, completed: 0, cancelled: 0 };
  for (const g of manifestGroups) {
    manifests.total += g.count;
    if (g._id === 'open')      manifests.active    += g.count;
    if (g._id === 'completed') manifests.completed += g.count;
    if (g._id === 'cancelled') manifests.cancelled += g.count;
  }

  const txns      = balance.transactions || [];
  const deposited = txns.filter(t => t.type === 'topup').reduce((s, t) => s + t.amount, 0);
  const spent     = txns.filter(t => t.type === 'deduction').reduce((s, t) => s + t.amount, 0);

  // Savings vs USPS retail Zone 1 rates
  let totalSavings   = 0;
  let savingsLabels  = 0;
  for (const lbl of uspsLabels) {
    const retail = getUspsZone1Rate(lbl.weight);
    if (retail === null) continue;
    const saving = retail - (lbl.price || 0);
    if (saving > 0) { totalSavings += saving; savingsLabels++; }
  }

  const trackingCounts = { not_scanned_yet: 0, in_transit: 0, out_for_delivery: 0, delivered: 0, exception_problem: 0, returned_to_sender: 0, pending_pickup: 0, delayed: 0 };
  for (const g of trackingStatusGroups) {
    const key = g._id || 'not_scanned_yet';
    if (key in trackingCounts) trackingCounts[key] = g.count;
  }

  return {
    balance: {
      currentBalance: balance.currentBalance,
      totalDeposited: deposited,
      totalSpent:     spent,
    },
    labels,
    manifests,
    savings: { total: totalSavings, labelCount: savingsLabels },
    recentLabels,
    activeManifests,
    trackingStatus: trackingCounts,
  };
}


// ── GET /api/stats/admin-live  (admin only) ──────────────────────────────────
// Real-time platform snapshot for the admin live monitor page.
router.get('/admin-live', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });

    const now          = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfHour  = new Date(now); startOfHour.setMinutes(0, 0, 0);

    const [
      labelsToday,
      labelsAllTime,
      labelsThisHour,
      carrierGroups,
      stateGroups,
      activeUsers,
      totalUsers,
      pendingManifests,
      completedManifests,
      revenueAgg,
      recentLabels,
    ] = await Promise.all([
      Label.countDocuments({ createdAt: { $gte: startOfToday }, status: 'generated' }),
      Label.countDocuments({ status: 'generated' }),
      Label.countDocuments({ createdAt: { $gte: startOfHour }, status: 'generated' }),
      Label.aggregate([
        { $match: { status: 'generated' } },
        { $group: { _id: '$carrier', count: { $sum: 1 }, revenue: { $sum: '$price' } } },
      ]),
      Label.aggregate([
        { $match: { status: 'generated', to_state: { $nin: ['', null] } } },
        { $group: { _id: '$to_state', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 30 },
      ]),
      User.countDocuments({ isActive: true, role: { $ne: 'admin' } }),
      User.countDocuments({ role: { $ne: 'admin' } }),
      ManifestJob.countDocuments({ status: 'open' }),
      ManifestJob.countDocuments({ status: 'completed' }),
      Label.aggregate([{ $group: { _id: null, total: { $sum: '$price' } } }]),
      Label.find({ status: 'generated' })
        .sort({ createdAt: -1 })
        .limit(20)
        .populate('user', 'firstName lastName')
        .select('carrier trackingId price to_state to_city createdAt user'),
    ]);

    const labelsByCarrier = {};
    for (const g of carrierGroups) labelsByCarrier[g._id || 'Other'] = { count: g.count, revenue: g.revenue || 0 };

    const minutesElapsed = now.getMinutes() || 1;

    res.json({
      labelsToday,
      labelsAllTime,
      labelsThisHour,
      perMinuteEst:      (labelsThisHour / minutesElapsed).toFixed(1),
      activeUsers,
      totalUsers,
      pendingManifests,
      completedManifests,
      totalRevenue:      revenueAgg[0]?.total || 0,
      labelsByCarrier,
      labelsByState:     stateGroups.map(s => ({ state: s._id, count: s.count })),
      recentLabels,
      fetchedAt:         now.toISOString(),
    });
  } catch (err) {
    console.error('Admin live stats error:', err);
    res.status(500).json({ message: 'Error fetching admin live stats' });
  }
});

// ── GET /api/stats/admin-warehouses  (admin only) ────────────────────────────
// Warehouse identity is derived from label "from" address fields.
router.get('/admin-warehouses', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });

    const limit = Math.min(Math.max(parseInt(String(req.query.limit || '100'), 10), 1), 500);

    const rows = await Label.aggregate([
      { $match: { status: 'generated' } },
      {
        $addFields: {
          warehouseKey: {
            $concat: [
              { $trim: { input: { $ifNull: ['$from_address1', ''] } } }, '|',
              { $trim: { input: { $ifNull: ['$from_city', ''] } } }, '|',
              { $trim: { input: { $ifNull: ['$from_state', ''] } } }, '|',
              { $trim: { input: { $ifNull: ['$from_zip', ''] } } }, '|',
              { $trim: { input: { $ifNull: ['$from_country', ''] } } },
            ],
          },
          warehouseName: {
            $cond: [
              { $gt: [{ $strLenCP: { $trim: { input: { $ifNull: ['$from_company', ''] } } } }, 0] },
              { $trim: { input: { $ifNull: ['$from_company', ''] } } },
              { $trim: { input: { $ifNull: ['$from_name', ''] } } },
            ],
          },
        },
      },
      {
        $match: {
          warehouseKey: { $nin: ['', '||||'] },
        },
      },
      {
        $group: {
          _id: '$warehouseKey',
          parcelCount: { $sum: 1 },
          users: { $addToSet: '$user' },
          totalRevenue: { $sum: '$price' },
          lastShipmentAt: { $max: '$createdAt' },
          firstShipmentAt: { $min: '$createdAt' },
          warehouseName: { $first: '$warehouseName' },
          from_address1: { $first: '$from_address1' },
          from_city: { $first: '$from_city' },
          from_state: { $first: '$from_state' },
          from_zip: { $first: '$from_zip' },
          from_country: { $first: '$from_country' },
        },
      },
      {
        $addFields: {
          userCount: { $size: '$users' },
        },
      },
      { $sort: { userCount: -1, parcelCount: -1, lastShipmentAt: -1 } },
      { $limit: limit },
      {
        $lookup: {
          from: 'users',
          localField: 'users',
          foreignField: '_id',
          as: 'userDocs',
        },
      },
      {
        $project: {
          _id: 0,
          warehouseKey: '$_id',
          warehouseName: 1,
          parcelCount: 1,
          userCount: 1,
          totalRevenue: 1,
          lastShipmentAt: 1,
          firstShipmentAt: 1,
          from_address1: 1,
          from_city: 1,
          from_state: 1,
          from_zip: 1,
          from_country: 1,
          users: {
            $map: {
              input: '$userDocs',
              as: 'u',
              in: {
                _id: '$$u._id',
                firstName: '$$u.firstName',
                lastName: '$$u.lastName',
                email: '$$u.email',
              },
            },
          },
        },
      },
    ]);

    const summary = rows.reduce((acc, row) => {
      acc.totalWarehouses += 1;
      acc.totalParcels += row.parcelCount || 0;
      acc.sharedWarehouses += row.userCount > 1 ? 1 : 0;
      if (row.userCount > acc.maxUsersOnSingleWarehouse) {
        acc.maxUsersOnSingleWarehouse = row.userCount;
      }
      return acc;
    }, { totalWarehouses: 0, totalParcels: 0, sharedWarehouses: 0, maxUsersOnSingleWarehouse: 0 });

    res.json({
      summary,
      warehouses: rows,
    });
  } catch (err) {
    console.error('Admin warehouse stats error:', err);
    res.status(500).json({ message: 'Error fetching warehouse stats' });
  }
});

// ── GET /api/stats/label-chart  (admin only) ─────────────────────────────────
// Query params:
//   from    — ISO date string, default = 30 days ago
//   to      — ISO date string, default = today
//   carrier — 'all' | 'USPS' | 'UPS' | 'FedEx' | 'DHL'  (default 'all')
//
// Auto-grouping:
//   ≤ 31 days  → daily
//   ≤ 90 days  → weekly  (week starting Monday)
//   > 90 days  → monthly
//
// carrier = 'all'  → lines per carrier
// carrier = <name> → lines per vendor (API labels + manifest jobs combined)
router.get('/label-chart', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });

    // ── Date range ────────────────────────────────────────────────────────────
    const now     = new Date();
    const rawFrom = req.query.from ? new Date(req.query.from) : new Date(now - 30 * 86400000);
    const rawTo   = req.query.to   ? new Date(req.query.to)   : now;

    const start = new Date(rawFrom); start.setHours(0, 0, 0, 0);
    const end   = new Date(rawTo);   end.setHours(23, 59, 59, 999);

    const carrier = req.query.carrier || 'all';

    // ── Auto-grouping ─────────────────────────────────────────────────────────
    const diffDays = Math.ceil((end - start) / 86400000);
    const grouping = diffDays <= 31 ? 'day' : diffDays <= 90 ? 'week' : 'month';

    // ── Helper: build ISO date key ────────────────────────────────────────────
    const isoKey = (y, m, d) =>
      `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;

    // ── Helper: generate bucket list ─────────────────────────────────────────
    function buildBuckets() {
      const buckets = [];
      if (grouping === 'day') {
        const cur = new Date(start);
        while (cur <= end) {
          const y = cur.getFullYear(), mo = cur.getMonth() + 1, d = cur.getDate();
          buckets.push({ _key: isoKey(y, mo, d), label: `${mo}/${d}`, total: 0 });
          cur.setDate(cur.getDate() + 1);
        }
      } else if (grouping === 'week') {
        const cur = new Date(start);
        // Align back to Monday
        const dow = cur.getDay() === 0 ? 6 : cur.getDay() - 1;
        cur.setDate(cur.getDate() - dow);
        cur.setHours(0, 0, 0, 0);
        while (cur <= end) {
          const wEnd = new Date(cur); wEnd.setDate(wEnd.getDate() + 6);
          buckets.push({ _key: isoKey(cur.getFullYear(), cur.getMonth()+1, cur.getDate()), _wEnd: new Date(wEnd), label: `${cur.getMonth()+1}/${cur.getDate()}`, total: 0 });
          cur.setDate(cur.getDate() + 7);
        }
      } else {
        const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const cur = new Date(start.getFullYear(), start.getMonth(), 1);
        while (cur <= end) {
          buckets.push({ _key: `${cur.getFullYear()}-${cur.getMonth()+1}`, label: `${MONTHS[cur.getMonth()]} ${cur.getFullYear()}`, total: 0 });
          cur.setMonth(cur.getMonth() + 1);
        }
      }
      return buckets;
    }

    // ── Helper: find bucket for a raw date row (_id has year/month/day) ──────
    function findBucket(buckets, id) {
      const k = isoKey(id.year, id.month, id.day);
      if (grouping === 'day') return buckets.find(b => b._key === k);
      if (grouping === 'week') {
        const d = new Date(k);
        return buckets.find(b => d >= new Date(b._key) && d <= b._wEnd);
      }
      return buckets.find(b => b._key === `${id.year}-${id.month}`);
    }

    const dayGroupStage = {
      year:  { $year:  '$createdAt' },
      month: { $month: '$createdAt' },
      day:   { $dayOfMonth: '$createdAt' },
    };

    // ══════════════════════════════════════════════════════════════════════════
    if (carrier === 'all') {
      // ── All carriers: API labels + completed manifest jobs ─────────────────
      const CARRIERS = ['USPS', 'UPS', 'FedEx', 'DHL'];

      const [labelRows, manifestRows] = await Promise.all([
        // API-generated labels (each row = 1 label)
        Label.aggregate([
          { $match: { createdAt: { $gte: start, $lte: end }, status: 'generated' } },
          { $group: { _id: { ...dayGroupStage, carrier: '$carrier' }, count: { $sum: 1 } } },
        ]),
        // Completed manifest jobs (each row = N labels via userBilling.labelCount)
        ManifestJob.aggregate([
          { $match: { createdAt: { $gte: start, $lte: end }, status: 'completed' } },
          { $group: { _id: { ...dayGroupStage, carrier: '$carrier' }, count: { $sum: '$userBilling.labelCount' } } },
        ]),
      ]);

      const buckets = buildBuckets();

      for (const r of [...labelRows, ...manifestRows]) {
        const b = findBucket(buckets, r._id);
        if (b && CARRIERS.includes(r._id.carrier)) {
          b[r._id.carrier] = (b[r._id.carrier] || 0) + r.count;
          b.total           = (b.total           || 0) + r.count;
        }
      }

      return res.json({ data: buckets, keys: CARRIERS, grouping });
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ── Specific carrier → per-vendor breakdown ────────────────────────────
    const [labelRows, manifestRows] = await Promise.all([
      // API-generated labels
      Label.aggregate([
        { $match: { createdAt: { $gte: start, $lte: end }, status: 'generated', carrier } },
        { $group: { _id: { ...dayGroupStage, vendor: '$vendorName' }, count: { $sum: 1 } } },
      ]),
      // Manifest jobs (only completed; count label qty not job qty)
      ManifestJob.aggregate([
        { $match: { createdAt: { $gte: start, $lte: end }, carrier, status: 'completed' } },
        { $lookup: { from: 'vendors', localField: 'vendor', foreignField: '_id', as: '_v' } },
        { $group: {
            _id: {
              ...dayGroupStage,
              vendor: { $arrayElemAt: ['$_v.name', 0] },
            },
            count: { $sum: '$userBilling.labelCount' },
        }},
      ]),
    ]);

    // Collect all vendor names seen
    const vendorSet = new Set();
    for (const r of labelRows)    if (r._id.vendor) vendorSet.add(r._id.vendor);
    for (const r of manifestRows) if (r._id.vendor) vendorSet.add(r._id.vendor);

    const buckets = buildBuckets();

    for (const r of [...labelRows, ...manifestRows]) {
      const vName = r._id.vendor || 'Unknown';
      const b = findBucket(buckets, r._id);
      if (b) {
        b[vName]  = (b[vName]  || 0) + r.count;
        b.total   = (b.total   || 0) + r.count;
      }
    }

    // Sort vendors by total (highest first)
    const vendorTotals = Array.from(vendorSet)
      .map(name => ({ name, total: buckets.reduce((s, b) => s + (b[name] || 0), 0) }))
      .filter(v => v.total > 0)
      .sort((a, b) => b.total - a.total);

    res.json({ data: buckets, keys: vendorTotals.map(v => v.name), vendorTotals, grouping });

  } catch (err) {
    console.error('Label chart error:', err);
    res.status(500).json({ message: 'Error fetching chart data' });
  }
});

// ── GET /api/stats/tracking-status  (user/reseller — month-filterable) ─────────
// Query: month=YYYY-MM (omit for all-time)
router.get('/tracking-status', authenticateToken, async (req, res) => {
  try {
    const { _id: userId } = req.user;
    const uid = new mongoose.Types.ObjectId(String(userId));
    const { month } = req.query;

    const matchStage = { user: uid, status: 'generated' };
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const [y, m] = month.split('-').map(Number);
      matchStage.createdAt = { $gte: new Date(y, m - 1, 1), $lt: new Date(y, m, 1) };
    }

    const groups = await Label.aggregate([
      { $match: matchStage },
      { $group: { _id: '$trackingStatus', count: { $sum: 1 } } },
    ]);

    const counts = { not_scanned_yet: 0, in_transit: 0, out_for_delivery: 0, delivered: 0,
      exception_problem: 0, returned_to_sender: 0, pending_pickup: 0, delayed: 0 };
    for (const g of groups) {
      const key = g._id || 'not_scanned_yet';
      if (key in counts) counts[key] = g.count;
    }
    res.json(counts);
  } catch (err) {
    console.error('Tracking status filter error:', err);
    res.status(500).json({ message: 'Error fetching tracking status' });
  }
});

module.exports = router;
