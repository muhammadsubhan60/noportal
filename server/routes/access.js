const express          = require('express');
const UserVendorAccess = require('../models/UserVendorAccess');
const Vendor           = require('../models/Vendor');
const User             = require('../models/User');
const { authenticateToken, authorize } = require('../middleware/auth');
const { resolvePortalLabels } = require('../utils/portalLabels');

const router = express.Router();

// ── Helper: build merged access list for a user ──────────────
// Each Vendor has a single carrier field.
// We return one access item per vendor.
async function buildAccessList(userId, isAdmin = false) {
  const vendors = await Vendor.find({ isActive: true }).sort({ carrier: 1, name: 1 });

  // Existing access records for this user
  const accessRecords = await UserVendorAccess.find({ user: userId });
  // Key: `${vendorId}:${carrier}`
  const accessMap = {};
  accessRecords.forEach(r => {
    accessMap[`${r.vendor.toString()}:${r.carrier}`] = r;
  });

  const result = [];
  for (const v of vendors) {
    const key = `${v._id.toString()}:${v.carrier}`;
    const rec = accessMap[key];
    const allSeries = v.shiplabelSeries || [];
    // Admin sees all series; users see only their allowed ones (empty allowedShiplabelSeries = all)
    const allowed = rec ? (rec.allowedShiplabelSeries || []) : [];
    const userSeries = isAdmin || allowed.length === 0
      ? allSeries
      : allSeries.filter(s => allowed.includes(s.series));

    result.push({
      vendorId:               v._id,
      vendorName:             v.name,
      carrier:                v.carrier,
      vendorType:             v.vendorType || 'api',
      shippingService:        v.shippingService || '',
      baseRate:               v.rate,
      isAllowed:              isAdmin ? true : (rec ? rec.isAllowed : false),
      rateTiers:              rec ? rec.rateTiers : [],
      portal:                 v.source === 'labelcrow' ? 'labelcrow' : v.source === 'shiplabel' ? 'shiplabel' : 'shippershub',
      shiplabelSeries:        userSeries,
      allowedShiplabelSeries: isAdmin ? allSeries.map(s => s.series) : allowed,
    });
  }
  return result;
}

// ── GET /api/access/me ───────────────────────────────────────
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const result       = await buildAccessList(req.user._id, req.user.role === 'admin');
    const portalLabels = await resolvePortalLabels(req.user);
    res.json({ access: result, portalLabels });
  } catch (err) {
    console.error('Get access (me) error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── Helper: verify reseller owns the target user ─────────────
async function resellerOwnsClient(resellerId, clientId) {
  const reseller = await User.findById(resellerId).select('clients');
  return (reseller?.clients || []).map(String).includes(String(clientId));
}

// ── PUT /api/access/bulk/vendor-access ───────────────────────
// Bulk enable/disable specific vendors for multiple users at once.
// Preserves existing rate tiers — only flips isAllowed.
// Body: { userIds, vendorEntries: [{ vendorId, carrier }], isAllowed }
router.put('/bulk/vendor-access', authenticateToken, authorize('admin', 'reseller'), async (req, res) => {
  try {
    const { userIds, vendorEntries, isAllowed } = req.body;
    if (!Array.isArray(userIds) || !Array.isArray(vendorEntries)) {
      return res.status(400).json({ message: 'userIds and vendorEntries must be arrays' });
    }
    if (typeof isAllowed !== 'boolean') {
      return res.status(400).json({ message: 'isAllowed must be a boolean' });
    }

    // Resellers may only operate on their own clients
    if (req.user.role === 'reseller') {
      const me = await User.findById(req.user._id).select('clients');
      const allowed = (me?.clients || []).map(String);
      const forbidden = userIds.filter(id => !allowed.includes(String(id)));
      if (forbidden.length) return res.status(403).json({ message: 'One or more users are not your clients' });
    }

    const ops = [];
    for (const userId of userIds) {
      for (const { vendorId, carrier } of vendorEntries) {
        ops.push({
          updateOne: {
            filter: { user: userId, vendor: vendorId, carrier },
            update: {
              $set: { isAllowed },
              $setOnInsert: { user: userId, vendor: vendorId, carrier, rateTiers: [] },
            },
            upsert: true,
          },
        });
      }
    }

    if (ops.length > 0) await UserVendorAccess.bulkWrite(ops);
    res.json({ message: `Updated ${ops.length} access records` });
  } catch (err) {
    console.error('Bulk vendor access error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── PUT /api/access/bulk/rates ───────────────────────────────
// Bulk-set rate tiers for multiple users × vendors in one shot.
// Body: { userIds, vendorEntries: [{ vendorId, carrier }], rateTiers, mode }
// mode='replace'       → always overwrite tiers (default)
// mode='skip_existing' → skip records that already have ≥1 tier
// Auto-enables access (isAllowed: true) for new/existing records.
router.put('/bulk/rates', authenticateToken, authorize('admin', 'reseller'), async (req, res) => {
  try {
    const { userIds, vendorEntries, rateTiers, mode = 'replace' } = req.body;

    if (!Array.isArray(userIds) || !userIds.length)
      return res.status(400).json({ message: 'userIds must be a non-empty array' });
    if (!Array.isArray(vendorEntries) || !vendorEntries.length)
      return res.status(400).json({ message: 'vendorEntries must be a non-empty array' });
    if (!Array.isArray(rateTiers) || !rateTiers.length)
      return res.status(400).json({ message: 'rateTiers must be a non-empty array' });

    // Resellers may only operate on their own clients
    if (req.user.role === 'reseller') {
      const me = await User.findById(req.user._id).select('clients');
      const allowed = (me?.clients || []).map(String);
      const forbidden = userIds.filter(id => !allowed.includes(String(id)));
      if (forbidden.length) return res.status(403).json({ message: 'One or more users are not your clients' });
    }

    for (const t of rateTiers) {
      if (t.minLbs < 0) return res.status(400).json({ message: 'Min lbs cannot be negative' });
      if (t.maxLbs !== null && t.maxLbs !== undefined && t.maxLbs <= t.minLbs)
        return res.status(400).json({ message: 'Max lbs must be greater than Min lbs' });
      if (t.rate < 0) return res.status(400).json({ message: 'Rate cannot be negative' });
    }

    // Build set of records to skip (those that already have tiers)
    const skipKeys = new Set();
    if (mode === 'skip_existing') {
      const existing = await UserVendorAccess.find({
        user:   { $in: userIds },
        vendor: { $in: vendorEntries.map(e => e.vendorId) },
        'rateTiers.0': { $exists: true },
      }).select('user vendor carrier').lean();
      existing.forEach(r => skipKeys.add(`${r.user}:${r.vendor}:${r.carrier}`));
    }

    const ops = [];
    for (const userId of userIds) {
      for (const { vendorId, carrier } of vendorEntries) {
        if (skipKeys.has(`${userId}:${vendorId}:${carrier}`)) continue;
        ops.push({
          updateOne: {
            filter: { user: userId, vendor: vendorId, carrier },
            update: {
              $set:        { isAllowed: true, rateTiers },
              $setOnInsert: { user: userId, vendor: vendorId, carrier },
            },
            upsert: true,
          },
        });
      }
    }

    if (ops.length > 0) await UserVendorAccess.bulkWrite(ops);
    const skipped = (userIds.length * vendorEntries.length) - ops.length;
    res.json({
      message: `Updated ${ops.length} record(s)${skipped > 0 ? `, skipped ${skipped} (already had tiers)` : ''}`,
      updated: ops.length,
      skipped,
    });
  } catch (err) {
    console.error('Bulk rates error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── GET /api/access/:userId ───────────────────────────────────
router.get('/:userId', authenticateToken, authorize('admin', 'reseller'), async (req, res) => {
  try {
    const { userId } = req.params;

    if (req.user.role === 'reseller' && !await resellerOwnsClient(req.user._id, userId)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const targetUser = await User.findById(userId);
    if (!targetUser) return res.status(404).json({ message: 'User not found' });

    const result = await buildAccessList(userId, targetUser.role === 'admin');
    res.json({ access: result });
  } catch (err) {
    console.error('Get access error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── PUT /api/access/:userId/bulk/save ────────────────────────
// Save all access records for a user in one request.
// Body: { records: [{ vendorId, carrier, isAllowed, rateTiers }] }
// MUST be defined before /:userId/:vendorId/:carrier to avoid "bulk" being cast as ObjectId.
router.put('/:userId/bulk/save', authenticateToken, authorize('admin', 'reseller'), async (req, res) => {
  try {
    const { userId } = req.params;
    if (req.user.role === 'reseller' && !await resellerOwnsClient(req.user._id, userId)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { records } = req.body;

    if (!Array.isArray(records)) return res.status(400).json({ message: 'records must be an array' });

    const ops = records.map(r => ({
      updateOne: {
        filter: { user: userId, vendor: r.vendorId, carrier: r.carrier },
        update: { $set: {
          user:      userId,
          vendor:    r.vendorId,
          carrier:   r.carrier,
          isAllowed: r.isAllowed,
          rateTiers: r.rateTiers || [],
        }},
        upsert: true,
      }
    }));

    if (ops.length > 0) await UserVendorAccess.bulkWrite(ops);

    res.json({ message: `Saved ${ops.length} access records` });
  } catch (err) {
    console.error('Bulk save access error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── PUT /api/access/:userId/:vendorId/:carrier ───────────────
// Upsert access config for one vendor+carrier combination.
router.put('/:userId/:vendorId/:carrier', authenticateToken, authorize('admin'), async (req, res) => {
  try {
    const { userId, vendorId, carrier } = req.params;
    const { isAllowed, rateTiers } = req.body;

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });
    if (vendor.carrier !== carrier) {
      return res.status(400).json({ message: `Vendor does not support carrier ${carrier}` });
    }

    // Validate tiers
    if (rateTiers && rateTiers.length > 0) {
      for (const tier of rateTiers) {
        if (tier.minLbs < 0) return res.status(400).json({ message: 'Min lbs cannot be negative' });
        if (tier.maxLbs !== null && tier.maxLbs !== undefined && tier.maxLbs <= tier.minLbs) {
          return res.status(400).json({ message: 'Max lbs must be greater than Min lbs' });
        }
        if (tier.rate < 0) return res.status(400).json({ message: 'Rate cannot be negative' });
      }
    }

    const record = await UserVendorAccess.findOneAndUpdate(
      { user: userId, vendor: vendorId, carrier },
      { $set: { user: userId, vendor: vendorId, carrier, isAllowed, rateTiers: rateTiers || [] } },
      { upsert: true, new: true }
    );

    res.json({ message: 'Access updated', record });
  } catch (err) {
    console.error('Update access error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
