const express  = require('express');
const fs       = require('fs');
const path     = require('path');
const archiver = require('archiver');
const { body, validationResult } = require('express-validator');
const Label            = require('../models/Label');
const Vendor           = require('../models/Vendor');
const Balance          = require('../models/Balance');
const UserVendorAccess = require('../models/UserVendorAccess');
const ManifestJob      = require('../models/ManifestJob');
const { authenticateToken, authorize } = require('../middleware/auth');
const shippershub = require('../services/shippershub');

// ── Helpers ───────────────────────────────────────────────────
const manifestRequestDir = path.join(__dirname, '../uploads/manifests/requests');
const labelsDir          = path.join(__dirname, '../uploads/labels');
const zipsDir            = path.join(__dirname, '../uploads/zips');
fs.mkdirSync(manifestRequestDir, { recursive: true });
fs.mkdirSync(labelsDir, { recursive: true });
fs.mkdirSync(zipsDir,   { recursive: true });

// Create a ZIP of PDF files using STORE (no recompression — preserves PDF bytes exactly)
function createZip(pdfPaths, zipFilename) {
  return new Promise((resolve, reject) => {
    const zipPath = path.join(zipsDir, zipFilename);
    const output  = fs.createWriteStream(zipPath);
    // level: 0 = STORE method — PDFs are already compressed internally,
    // re-compressing degrades nothing but wastes CPU and can increase size.
    const archive = archiver('zip', { zlib: { level: 0 } });
    output.on('close', () => resolve(zipPath));
    archive.on('error', reject);
    archive.pipe(output);
    pdfPaths.forEach((p, i) => {
      if (p && fs.existsSync(p)) {
        archive.file(p, { name: `label-${i + 1}-${path.basename(p)}` });
      }
    });
    archive.finalize();
  });
}

function rowsToCSV(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape  = v => { const s = String(v ?? ''); return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g,'""')}"` : s; };
  return [headers.join(','), ...rows.map(r => headers.map(h => escape(r[h])).join(','))].join('\n');
}

const router = express.Router();

/** Maximum results per page for list endpoints */
const PAGE_LIMIT_MAX = 100;

/** Escape special regex characters to prevent ReDoS */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Validate that a value is a 24-character hex string (MongoDB ObjectId) */
function isValidObjectId(v) {
  return /^[0-9a-fA-F]{24}$/.test(String(v));
}

const { buildTrackingStatusFilter, NORMALIZED_TS_EXPR, tallyStatusCounts } = require('../utils/trackingStatus');

// ── POST /api/labels/single ───────────────────────────────────
// Generate a single label via ShippersHub, deduct balance
router.post('/single', authenticateToken, [
  body('vendorId').notEmpty().withMessage('Vendor ID is required'),
  body('from_name').notEmpty().withMessage('From name is required'),
  body('from_address1').notEmpty().withMessage('From address is required'),
  body('from_city').notEmpty().withMessage('From city is required'),
  body('from_state').notEmpty().withMessage('From state is required'),
  body('from_zip').notEmpty().withMessage('From zip is required'),
  body('to_name').notEmpty().withMessage('To name is required'),
  body('to_address1').notEmpty().withMessage('To address is required'),
  body('to_city').notEmpty().withMessage('To city is required'),
  body('to_state').notEmpty().withMessage('To state is required'),
  body('to_zip').notEmpty().withMessage('To zip is required'),
  body('weight').isFloat({ gt: 0 }).withMessage('Weight must be a positive number')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
    }

    const { vendorId, ...labelFields } = req.body;

    // Load the vendor config
    const vendor = await Vendor.findById(vendorId);
    if (!vendor || !vendor.isActive) {
      return res.status(404).json({ message: 'Vendor not found or inactive' });
    }

    // Ensure user has access to this vendor and compute effective rate based on weight tiers
    const isAdmin = req.user.role === 'admin';
    const access  = isAdmin ? null : await UserVendorAccess.findOne({ user: req.user._id, vendor: vendorId });
    if (!isAdmin && (!access || !access.isAllowed)) {
      return res.status(403).json({ message: 'You are not allowed to use this vendor' });
    }

    const weight = parseFloat(labelFields.weight);

    // Weight range validation — enforce when user has rate tiers configured
    if (!isAdmin && access.rateTiers && access.rateTiers.length > 0) {
      const matched = access.getRateForWeight(weight);
      if (matched === null) {
        const ranges = access.rateTiers
          .map(t => t.maxLbs === null ? `${t.minLbs}+ lbs` : `${t.minLbs}–${t.maxLbs} lbs`)
          .join(', ');
        return res.status(400).json({
          message: `Weight ${weight} lbs is outside your allowed range. Allowed: ${ranges}.`,
        });
      }
    }

    const tierRate = isAdmin ? null : access.getRateForWeight(weight);
    const effectiveRate = tierRate !== null && tierRate !== undefined ? tierRate : vendor.rate;

    // Check user has sufficient balance
    const balance = await Balance.getOrCreateBalance(req.user._id);
    if (balance.currentBalance < effectiveRate) {
      return res.status(402).json({
        message: `Insufficient balance. Need $${effectiveRate.toFixed(2)}, have $${balance.currentBalance.toFixed(2)}`
      });
    }

    // Call ShippersHub to generate label
    let shippershubResult = null;
    let trackingId = '';

    if (vendor.source === 'shippershub' && vendor.shippershubCarrierId && vendor.shippershubVendorId) {
      shippershubResult = await shippershub.createSingleLabel({
        carrier:  vendor.shippershubCarrierId,
        vendor:   vendor.shippershubVendorId,
        weight:   parseFloat(labelFields.weight),
        note:     labelFields.note || '',
        from_name:     labelFields.from_name,
        from_company:  labelFields.from_company || '',
        from_phone:    labelFields.from_phone || '',
        from_address1: labelFields.from_address1,
        from_address2: labelFields.from_address2 || '',
        from_city:     labelFields.from_city,
        from_state:    labelFields.from_state,
        from_zip:      labelFields.from_zip,
        from_country:  labelFields.from_country || 'USA',
        to_name:       labelFields.to_name,
        to_company:    labelFields.to_company || '',
        to_phone:      labelFields.to_phone || '',
        to_address1:   labelFields.to_address1,
        to_address2:   labelFields.to_address2 || '',
        to_city:       labelFields.to_city,
        to_state:      labelFields.to_state,
        to_zip:        labelFields.to_zip,
        to_country:    labelFields.to_country || 'USA',
        length: parseFloat(labelFields.length) || 1,
        width:  parseFloat(labelFields.width)  || 1,
        height: parseFloat(labelFields.height) || 1,
      });
      trackingId = shippershubResult?.trackingID || shippershubResult?.trackingId || '';
    }

    // Deduct balance
    await balance.addTransaction({
      type:        'deduction',
      amount:      effectiveRate,
      description: `Label generated — ${vendor.carrier} ${vendor.name} (${trackingId || 'N/A'})`,
      performedBy: req.user._id
    });

    // Save label record
    const label = await Label.create({
      user:              req.user._id,
      vendor:            vendor._id,
      carrier:           vendor.carrier,
      vendorName:        vendor.name,
      shippingService:   vendor.shippingService,
      shippershubLabelId: shippershubResult?._id || null,
      trackingId,
      price:      effectiveRate,
      pdfUrl:     shippershubResult?.awsPath || shippershubResult?.pdfUrl || null,
      awsKey:     shippershubResult?.awsKey  || null,
      awsPath:    shippershubResult?.awsPath || null,
      isBulk:     false,
      ...labelFields,
      weight: parseFloat(labelFields.weight)
    });

    // Notify via socket.io
    if (req.io) {
      req.io.to(req.user._id.toString()).emit('label-generated', {
        labelId: label._id, trackingId, carrier: vendor.carrier
      });
      // Real-time feed for admin live monitor
      req.io.to('admin-room').emit('admin-label-generated', {
        carrier:   vendor.carrier,
        trackingId,
        price:     label.price || 0,
        toState:   label.to_state || '',
        toCity:    label.to_city  || '',
        createdAt: label.createdAt,
      });
    }

    res.status(201).json({
      message: 'Label generated successfully',
      label: {
        id:         label._id,
        trackingId: label.trackingId,
        carrier:    label.carrier,
        vendor:     label.vendorName,
        price:      label.price,
        pdfUrl:     label.pdfUrl,
        createdAt:  label.createdAt
      },
      newBalance: balance.currentBalance
    });

  } catch (error) {
    console.error('Generate single label error:', error);
    // ShippersHub API errors are downstream failures, not server crashes — return 400
    const isShippersHubError = error.message && (
      error.message.includes('ShippersHub') ||
      error.message.includes('carrier') ||
      error.message.includes('vendor') ||
      error.message.includes('label') ||
      error.message.includes('token') ||
      error.message.includes('Invalid') ||
      error.message.includes('not found') ||
      error.message.includes('Unauthorized')
    );
    res.status(isShippersHubError ? 400 : 500).json({ message: error.message || 'Server error generating label' });
  }
});

// ── POST /api/labels/bulk ─────────────────────────────────────
// Bulk label generation — accepts array of addresses
router.post('/bulk', authenticateToken, [
  body('vendorId').notEmpty().withMessage('Vendor ID is required'),
  body('labels').isArray({ min: 1 }).withMessage('At least one label is required'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
    }

    const { vendorId, labels: labelRows } = req.body;

    const vendor = await Vendor.findById(vendorId);
    if (!vendor || !vendor.isActive) {
      return res.status(404).json({ message: 'Vendor not found or inactive' });
    }

    // Access check — admin bypasses, regular users must have an allowed record
    const isAdmin = req.user.role === 'admin';
    const access  = isAdmin ? null : await UserVendorAccess.findOne({ user: req.user._id, vendor: vendorId });
    if (!isAdmin && (!access || !access.isAllowed)) {
      return res.status(403).json({ message: 'You are not allowed to use this vendor' });
    }

    // Weight range validation — enforce when user has rate tiers configured
    if (!isAdmin && access.rateTiers && access.rateTiers.length > 0) {
      const outOfRange = labelRows
        .map((r, i) => ({ row: i + 1, weight: parseFloat(r.weight) || 0 }))
        .filter(({ weight }) => access.getRateForWeight(weight) === null);
      if (outOfRange.length > 0) {
        const ranges = access.rateTiers
          .map(t => t.maxLbs === null ? `${t.minLbs}+ lbs` : `${t.minLbs}–${t.maxLbs} lbs`)
          .join(', ');
        return res.status(400).json({
          message: `${outOfRange.length} row(s) have weight outside your allowed range (${ranges}).`,
          invalidRows: outOfRange,
        });
      }
    }

    // Effective rate helper
    const getRate = (weight) => {
      if (isAdmin) return vendor.rate;
      const tierRate = access.getRateForWeight(weight);
      return (tierRate !== null && tierRate !== undefined) ? tierRate : vendor.rate;
    };

    // Pre-calculate costs
    const rowCosts  = labelRows.map(r => getRate(parseFloat(r.weight) || 0));
    const totalCost = rowCosts.reduce((s, c) => s + c, 0);

    const balance = await Balance.getOrCreateBalance(req.user._id);
    if (balance.currentBalance < totalCost) {
      return res.status(402).json({
        message: `Insufficient balance. Need $${totalCost.toFixed(2)} for ${labelRows.length} labels, have $${balance.currentBalance.toFixed(2)}`
      });
    }

    // ── MANIFEST PATH ─────────────────────────────────────────
    if (vendor.vendorType === 'manifest') {
      // Deduct balance upfront
      await balance.addTransaction({
        type:        'deduction',
        amount:      totalCost,
        description: `Manifest job — ${labelRows.length}x ${vendor.carrier} ${vendor.name}`,
        performedBy: req.user._id,
      });

      // Save CSV to disk
      const csvContent  = rowsToCSV(labelRows);
      const unique      = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const storedName  = `manifest-req-${unique}.csv`;
      const storedPath  = path.join(manifestRequestDir, storedName);
      fs.writeFileSync(storedPath, csvContent, 'utf8');

      // Create open ManifestJob (broadcast to all matching vendors)
      const job = await ManifestJob.create({
        user:    req.user._id,
        carrier: vendor.carrier,
        vendor:  vendor._id,
        status:  'open',
        requestFile: {
          originalName: `${vendor.carrier}_${vendor.name}_bulk.csv`,
          storedName,
          path:       storedPath,
          labelCount: labelRows.length,
        },
        userBilling: {
          labelCount:  labelRows.length,
          totalAmount: totalCost,
          deducted:    true,
          deductedAt:  new Date(),
        },
        timeline: [{ status: 'open', note: 'Job submitted by user — open for vendor acceptance' }],
      });

      // Broadcast to vendor portal via socket
      if (req.io) req.io.emit('manifest-job-open', { jobId: job._id, carrier: vendor.carrier });

      return res.status(201).json({
        type:        'manifest',
        manifestJobId: job._id,
        status:      'open',
        labelCount:  labelRows.length,
        carrier:     vendor.carrier,
        vendorName:  vendor.name,
        totalCost,
        newBalance:  balance.currentBalance,
        message:     'Manifest job submitted — waiting for a vendor to accept',
      });
    }

    // ── LABELCROW PATH ────────────────────────────────────────
    if (vendor.source === 'labelcrow') {
      const labelcrow = require('../services/labelcrow');

      // Deduct balance upfront (job is async — held like a manifest)
      await balance.addTransaction({
        type:        'deduction',
        amount:      totalCost,
        description: `Label Crow bulk — ${labelRows.length}x ${vendor.carrier} ${vendor.name} (queued)`,
        performedBy: req.user._id,
      });

      // Submit to Label Crow API
      const { jobId, orderId, totalLabels } = await labelcrow.submitBulkJob({
        seriesId:     vendor.labelcrowSeriesId,
        carrier:      vendor.carrier.toLowerCase(),
        serviceClass: vendor.labelcrowServiceClass,
        providerKey:  vendor.labelcrowProviderKey,
        labels:       labelRows,
      });

      // Create pending Label records for history/audit trail
      const mongooseLc = require('mongoose');
      const lcBulkJobId = new mongooseLc.Types.ObjectId().toString();
      await Label.insertMany(labelRows.map((row, i) => ({
        user:             req.user._id,
        vendor:           vendor._id,
        carrier:          vendor.carrier,
        vendorName:       vendor.name,
        shippingService:  vendor.shippingService || '',
        price:            rowCosts[i],
        isBulk:           true,
        bulkJobId:        lcBulkJobId,
        labelcrowJobId:   jobId,
        labelcrowOrderId: String(orderId),
        status:           'pending',
        ...row,
        weight: parseFloat(row.weight) || 0,
      })));

      return res.status(202).json({
        type:       'labelcrow-async',
        lcJobId:    jobId,
        lcOrderId:  orderId,
        total:      totalLabels,
        bulkJobId:  lcBulkJobId,
        newBalance: balance.currentBalance,
      });
    }

    // ── SHIPLABEL PATH ────────────────────────────────────────
    if (vendor.source === 'shiplabel') {
      const shiplabel  = require('../services/shiplabel');
      const mongoose2  = require('mongoose');
      const slBulkJobId = new mongoose2.Types.ObjectId().toString();

      // Deduct balance upfront
      await balance.addTransaction({
        type:        'deduction',
        amount:      totalCost,
        description: `ShipLabel bulk — ${labelRows.length}x ${vendor.carrier} ${vendor.name}`,
        performedBy: req.user._id,
      });

      // Create pending Label records
      const labelDocs = await Label.insertMany(labelRows.map((row, i) => ({
        user:             req.user._id,
        vendor:           vendor._id,
        carrier:          vendor.carrier,
        vendorName:       vendor.name,
        shippingService:  vendor.shippingService || '',
        price:            rowCosts[i],
        isBulk:           true,
        bulkJobId:        slBulkJobId,
        status:           'pending',
        ...row,
        weight: parseFloat(row.weight) || 0,
      })));

      // Process labels in background — batches of 5 for speed
      const userId = req.user._id;
      setImmediate(async () => {
        const BATCH = 5;
        for (let i = 0; i < labelDocs.length; i += BATCH) {
          const batch = labelDocs.slice(i, i + BATCH);
          await Promise.all(batch.map(async (labelDoc, bi) => {
            const row = labelRows[i + bi];
            if (!row) return;
            try {
              const payload = {
                label_id:     vendor.shiplabelServiceId,
                fromName:     row.from_name     || '',
                fromCompany:  row.from_company  || '',
                fromAddress:  row.from_address1 || '',
                fromAddress2: row.from_address2 || '',
                fromZip:      row.from_zip      || '',
                fromState:    row.from_state    || '',
                fromCity:     row.from_city     || '',
                fromCountry:  'US',
                toName:       row.to_name       || '',
                toCompany:    row.to_company    || '',
                toAddress:    row.to_address1   || '',
                toAddress2:   row.to_address2   || '',
                toZip:        row.to_zip        || '',
                toState:      row.to_state      || '',
                toCity:       row.to_city       || '',
                toCountry:    'US',
                weight:       parseFloat(row.weight) || 0,
                length:       parseFloat(row.length) || 0,
                height:       parseFloat(row.height) || 0,
                width:        parseFloat(row.width)  || 0,
                ...(vendor.shiplabelLabelSeries ? { label_series: vendor.shiplabelLabelSeries } : {}),
                ...(vendor.shiplabelLabelFormat ? { label_format: vendor.shiplabelLabelFormat } : {}),
              };
              const result = await shiplabel.createOrder(payload);
              await Label.updateOne({ _id: labelDoc._id }, {
                $set: {
                  status:           'generated',
                  trackingId:       result.tracking_id || '',
                  pdfUrl:           result.pdf         || null,
                  shiplabelOrderId: String(result.tracking_id || ''),
                },
              });
            } catch (err) {
              console.error('[ShipLabel] label failed:', err.message);
              // Refund this label's cost
              try {
                const refundBalance = await Balance.getOrCreateBalance(userId);
                await refundBalance.addTransaction({
                  type:        'adjustment',
                  amount:      labelDoc.price,
                  description: `ShipLabel refund — label failed (${err.message.slice(0, 60)})`,
                });
              } catch (refundErr) {
                console.error('[ShipLabel] refund failed:', refundErr.message);
              }
              await Label.updateOne({ _id: labelDoc._id }, { $set: { status: 'failed' } });
            }
          }));
        }
      });

      return res.status(202).json({
        type:       'shiplabel-async',
        bulkJobId:  slBulkJobId,
        total:      labelDocs.length,
        newBalance: balance.currentBalance,
      });
    }

    // ── API PATH ──────────────────────────────────────────────
    const mongoose = require('mongoose');
    const bulkJobId   = new mongoose.Types.ObjectId().toString();
    const results     = [];
    const savedLabels = [];

    for (let i = 0; i < labelRows.length; i++) {
      const row = labelRows[i];
      try {
        let shippershubResult = null;
        let trackingId = '';

        if (vendor.source === 'shippershub' && vendor.shippershubCarrierId && vendor.shippershubVendorId) {
          shippershubResult = await shippershub.createSingleLabel({
            carrier:  vendor.shippershubCarrierId,
            vendor:   vendor.shippershubVendorId,
            ...row,
            weight: parseFloat(row.weight)
          });
          trackingId = shippershubResult?.trackingID || shippershubResult?.trackingId || '';
        }

        const label = await Label.create({
          user:              req.user._id,
          vendor:            vendor._id,
          carrier:           vendor.carrier,
          vendorName:        vendor.name,
          shippingService:   vendor.shippingService,
          shippershubLabelId: shippershubResult?._id || null,
          trackingId,
          price:   rowCosts[i],
          pdfUrl:  shippershubResult?.awsPath || null,
          awsKey:  shippershubResult?.awsKey  || null,
          awsPath: shippershubResult?.awsPath || null,
          isBulk:      true,
          bulkJobId,
          ...row,
          weight: parseFloat(row.weight)
        });

        savedLabels.push(label);
        results.push({
          success: true, trackingId, labelId: label._id, cost: rowCosts[i],
          pdfUrl: shippershubResult?.awsPath || null,
          localPdf: shippershubResult?.localPdf || null,
        });
      } catch (err) {
        results.push({ success: false, error: err.message, row });
      }
    }

    // Deduct for successfully generated labels
    const successfulResults = results.filter(r => r.success);
    const totalDeduct = successfulResults.reduce((sum, r) => sum + (r.cost ?? 0), 0);
    const successCount = successfulResults.length;
    if (totalDeduct > 0) {
      await balance.addTransaction({
        type:        'deduction',
        amount:      totalDeduct,
        description: `Bulk labels — ${successfulResults.length}x ${vendor.carrier} ${vendor.name} (job: ${bulkJobId.slice(-6)})`,
        performedBy: req.user._id
      });
    }

    // Build ZIP of all generated PDFs (STORE, no recompression — preserves original bytes)
    let zipUrl = null;
    const localPdfs = successfulResults.map(r => r.localPdf).filter(Boolean);
    if (localPdfs.length > 0) {
      try {
        const zipFilename = `bulk-${bulkJobId.slice(-8)}-${Date.now()}.zip`;
        await createZip(localPdfs, zipFilename);
        zipUrl = `/labels/zip/${zipFilename}`;
        // Stamp the pre-built zip URL on every label in this batch so history can serve it directly
        await Label.updateMany({ bulkJobId }, { bulkZipUrl: zipUrl });
      } catch (zipErr) {
        console.error('ZIP creation error:', zipErr);
      }
    }

    res.status(201).json({
      type:       'api',
      message:    `${successCount}/${labelRows.length} labels generated`,
      bulkJobId,
      results,
      zipUrl,
      newBalance: balance.currentBalance
    });

  } catch (error) {
    console.error('Bulk label error:', error);
    res.status(500).json({ message: error.message || 'Server error generating bulk labels' });
  }
});

// ── GET /api/labels ───────────────────────────────────────────
// Paginated label history for the authenticated user (single + bulk)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { carrier, status, dateFrom, dateTo, type, trackingStatus } = req.query;
    const page  = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(parseInt(req.query.limit) || 15, PAGE_LIMIT_MAX);

    // Validate vendor ID before passing to MongoDB
    const vendorParam = req.query.vendor;
    if (vendorParam && !isValidObjectId(vendorParam)) {
      return res.status(400).json({ message: 'Invalid vendor ID' });
    }

    // Base filter: everything except the trackingStatus facet (used to compute status counts below)
    let baseFilter = {};
    if (req.user.role !== 'admin') {
      baseFilter.user = req.user._id;
    }
    if (type === 'single')   baseFilter.isBulk = false;
    else if (type === 'bulk') baseFilter.isBulk = true;
    if (carrier)     baseFilter.carrier = carrier;
    if (status)      baseFilter.status  = status;
    if (vendorParam) baseFilter.vendor  = vendorParam;
    if (dateFrom || dateTo) {
      baseFilter.createdAt = {};
      if (dateFrom) baseFilter.createdAt.$gte = new Date(dateFrom);
      if (dateTo)   baseFilter.createdAt.$lte = new Date(new Date(dateTo).setHours(23, 59, 59, 999));
    }

    // Full filter additionally scoped to the requested tracking-status facet
    const filter = { ...baseFilter, ...buildTrackingStatusFilter(trackingStatus) };

    const [total, labels, statusCountsAgg, typeCountsAgg] = await Promise.all([
      Label.countDocuments(filter),
      Label.find(filter)
        .populate('user', 'firstName lastName email')
        .populate('vendor', 'name carrier rate')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Label.aggregate([
        { $match: baseFilter },
        { $group: { _id: NORMALIZED_TS_EXPR, count: { $sum: 1 } } },
      ]),
      Label.aggregate([
        { $match: baseFilter },
        { $group: { _id: '$isBulk', count: { $sum: 1 } } },
      ]),
    ]);

    const statusCounts = tallyStatusCounts(statusCountsAgg);
    const typeCounts = { single: 0, bulk: 0 };
    for (const g of typeCountsAgg) {
      if (g._id === true) typeCounts.bulk += g.count;
      else typeCounts.single += g.count;
    }

    res.json({
      labels,
      total,
      totalPages:  Math.ceil(total / limit),
      currentPage: page,
      statusCounts,
      typeCounts,
    });
  } catch (error) {
    console.error('Get labels error:', error);
    res.status(500).json({ message: 'Server error getting labels' });
  }
});

// ── GET /api/labels/track-all-ids ─────────────────────────────
// Lightweight, unpaginated list of tracking IDs matching the current filters,
// used to power "master tracking" across every page of results.
router.get('/track-all-ids', authenticateToken, async (req, res) => {
  try {
    const { carrier, dateFrom, dateTo, type, trackingStatus } = req.query;

    const vendorParam = req.query.vendor;
    if (vendorParam && !isValidObjectId(vendorParam)) {
      return res.status(400).json({ message: 'Invalid vendor ID' });
    }

    let filter = {};
    if (req.user.role !== 'admin') filter.user = req.user._id;
    if (type === 'single')   filter.isBulk = false;
    else if (type === 'bulk') filter.isBulk = true;
    if (carrier)     filter.carrier = carrier;
    if (vendorParam) filter.vendor  = vendorParam;
    Object.assign(filter, buildTrackingStatusFilter(trackingStatus));
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo)   filter.createdAt.$lte = new Date(new Date(dateTo).setHours(23, 59, 59, 999));
    }
    filter.trackingId = { $exists: true, $ne: '' };

    // Safety cap so a very large account can't be used to force a huge unpaginated query
    const MAX_IDS = 3500;
    const labels = await Label.find(filter)
      .select('trackingId carrier')
      .sort({ createdAt: -1 })
      .limit(MAX_IDS)
      .lean();

    res.json({
      items:    labels.map(l => ({ trackingId: l.trackingId, carrier: l.carrier })),
      total:    labels.length,
      truncated: labels.length >= MAX_IDS,
    });
  } catch (error) {
    console.error('Get track-all ids error:', error);
    res.status(500).json({ message: 'Server error getting tracking IDs' });
  }
});

// ── GET /api/labels/bulk-jobs ─────────────────────────────────
// Returns bulk jobs grouped by bulkJobId with aggregated totals
router.get('/bulk-jobs', authenticateToken, async (req, res) => {
  try {
    const { dateFrom, dateTo, carrier, portal } = req.query;
    const page  = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(parseInt(req.query.limit) || 15, PAGE_LIMIT_MAX);
    const skip  = (page - 1) * limit;
    const mongoose = require('mongoose');

    // Validate vendor IDs
    const vid = req.query.vendorId || req.query.vendor;
    if (vid && !isValidObjectId(vid)) {
      return res.status(400).json({ message: 'Invalid vendor ID' });
    }

    // Escape search string to prevent ReDoS
    const rawSearch = req.query.search;
    const search = rawSearch && rawSearch.length <= 100 ? escapeRegex(rawSearch) : null;

    // Portal filter: pre-fetch vendor IDs that belong to the requested portal
    let portalVendorIds = null;
    if (portal && portal !== 'all') {
      const pv = await Vendor.find({ source: portal }).select('_id').lean();
      portalVendorIds = pv.map(v => v._id);
    }

    const matchStage = { isBulk: true };
    if (req.user.role !== 'admin') matchStage.user = new mongoose.Types.ObjectId(req.user._id);
    if (vid)              matchStage.vendor       = new mongoose.Types.ObjectId(vid);
    else if (portalVendorIds) matchStage.vendor   = { $in: portalVendorIds };
    if (carrier) matchStage.carrier      = carrier;
    if (search)  matchStage.bulkFileName = { $regex: search, $options: 'i' };
    if (dateFrom || dateTo) {
      matchStage.createdAt = {};
      if (dateFrom) matchStage.createdAt.$gte = new Date(dateFrom);
      if (dateTo)   matchStage.createdAt.$lte = new Date(new Date(dateTo).setHours(23, 59, 59, 999));
    }

    const groupStage = {
      _id:           '$bulkJobId',
      userId:        { $first: '$user' },
      vendorId:      { $first: '$vendor' },
      vendorName:    { $first: '$vendorName' },
      carrier:       { $first: '$carrier' },
      bulkFileName:  { $first: '$bulkFileName' },
      bulkZipUrl:    { $first: '$bulkZipUrl' },
      totalLabels:   { $sum: 1 },
      totalPrice:    { $sum: '$price' },
      generatedCount:{ $sum: { $cond: [{ $eq: ['$status', 'generated'] }, 1, 0] } },
      failedCount:   { $sum: { $cond: [{ $eq: ['$status', 'failed']    }, 1, 0] } },
      trackingIds:   { $push: '$trackingId' },
      createdAt:     { $min: '$createdAt' },
    };

    const [jobs, countResult] = await Promise.all([
      Label.aggregate([
        { $match: matchStage },
        { $group: groupStage },
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: limit },
        { $lookup: { from: 'users',   localField: 'userId',   foreignField: '_id', as: 'user' } },
        { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
        // Lookup vendor to attach portal/source
        { $lookup: { from: 'vendors', localField: 'vendorId', foreignField: '_id', as: '_v' } },
        { $addFields: { portal: { $ifNull: [{ $arrayElemAt: ['$_v.source', 0] }, 'shippershub'] } } },
        { $project: { _v: 0 } },
      ]),
      Label.aggregate([
        { $match: matchStage },
        { $group: { _id: '$bulkJobId' } },
        { $count: 'total' },
      ]),
    ]);

    const total = countResult[0]?.total ?? 0;

    res.json({
      jobs,
      total,
      totalPages:  Math.ceil(total / limit),
      currentPage: page,
    });
  } catch (error) {
    console.error('Get bulk jobs error:', error);
    res.status(500).json({ message: 'Server error getting bulk jobs' });
  }
});

// ── GET /api/labels/pdf/:filename ─────────────────────────────
// Serve a locally saved label PDF (authenticated)
router.get('/pdf/:filename', authenticateToken, (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(labelsDir, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ message: 'PDF not found' });
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  fs.createReadStream(filePath).pipe(res);
});

// ── GET /api/labels/:id/pdf  ──────────────────────────────────
// ── Admin: update tracking status on a label ──────────────────────────────────
const VALID_TRACKING_STATUSES = [
  'not_scanned_yet', 'in_transit', 'out_for_delivery', 'delivered',
  'exception_problem', 'returned_to_sender', 'pending_pickup', 'delayed',
];

// Normalize various ChatGPT / user-supplied formats to canonical DB keys
function normalizeTrackingStatus(raw) {
  const s = (raw || '').trim().toLowerCase().replace(/[\s\-\/]+/g, '_');
  const MAP = {
    'not_scanned_yet': 'not_scanned_yet', 'not_scanned': 'not_scanned_yet',
    'in_transit': 'in_transit', 'intransit': 'in_transit',
    'out_for_delivery': 'out_for_delivery', 'outfordelivery': 'out_for_delivery',
    'delivered': 'delivered',
    'exception_problem': 'exception_problem', 'exception': 'exception_problem',
    'exception___problem': 'exception_problem',
    'returned_to_sender': 'returned_to_sender', 'return_to_sender': 'returned_to_sender',
    'returnedtosender': 'returned_to_sender',
    'pending_pickup': 'pending_pickup', 'pendingpickup': 'pending_pickup',
    'delayed': 'delayed',
  };
  return MAP[s] || null;
}

router.patch('/:id/tracking-status', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
    const { trackingStatus, note } = req.body;
    if (!VALID_TRACKING_STATUSES.includes(trackingStatus)) {
      return res.status(400).json({ message: 'Invalid tracking status' });
    }
    const historyEntry = {
      status:    trackingStatus,
      note:      (note || '').trim().slice(0, 500),
      updatedAt: new Date(),
      updatedBy: req.user._id,
    };
    const label = await Label.findByIdAndUpdate(
      req.params.id,
      {
        $set:  { trackingStatus },
        $push: { trackingStatusHistory: { $each: [historyEntry], $position: 0 } },
      },
      { new: true, select: 'trackingStatus trackingStatusHistory' }
    );
    if (!label) return res.status(404).json({ message: 'Label not found' });
    res.json({ trackingStatus: label.trackingStatus, trackingStatusHistory: label.trackingStatusHistory });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error updating tracking status' });
  }
});

// ── Admin: bulk update tracking status by tracking ID ─────────────────────────
router.post('/bulk-status-by-tracking', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
    const { updates } = req.body; // [{ trackingId, status }]
    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ message: 'updates must be a non-empty array' });
    }
    if (updates.length > 5000) {
      return res.status(400).json({ message: 'Too many updates — max 5000 per batch' });
    }

    const historyEntry = (status) => ({
      status,
      note: 'AI bulk update',
      updatedAt: new Date(),
      updatedBy: req.user._id,
    });

    // Normalize + group by canonical status
    const grouped = {};   // { status -> [trackingId] }
    const invalidIds = [];

    for (const { trackingId, status } of updates) {
      if (!trackingId) continue;
      const normalized = normalizeTrackingStatus(status);
      if (!normalized) { invalidIds.push(trackingId); continue; }
      if (!grouped[normalized]) grouped[normalized] = [];
      grouped[normalized].push(trackingId.trim());
    }

    const allTrackingIds = Object.values(grouped).flat();

    // Fetch existing labels to detect "already same" and "not found"
    const existing = await Label.find({ trackingId: { $in: allTrackingIds } })
      .select('trackingId trackingStatus').lean();
    const existingMap = Object.fromEntries(existing.map(l => [l.trackingId, l.trackingStatus]));

    let updated = 0;
    let alreadySame = 0;

    for (const [status, ids] of Object.entries(grouped)) {
      const toUpdate = ids.filter(id => id in existingMap && existingMap[id] !== status);
      alreadySame  += ids.filter(id => id in existingMap && existingMap[id] === status).length;
      if (toUpdate.length === 0) continue;
      await Label.updateMany(
        { trackingId: { $in: toUpdate } },
        {
          $set:  { trackingStatus: status },
          $push: { trackingStatusHistory: { $each: [historyEntry(status)], $position: 0 } },
        }
      );
      updated += toUpdate.length;
    }

    const notFound = allTrackingIds.filter(id => !(id in existingMap));

    res.json({ updated, alreadySame, notFound, invalid: invalidIds });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error in bulk status update' });
  }
});

// Proxy-serve a label PDF by label ID.
// Works for both S3 / external URLs and locally stored files.
// Accepts ?inline=1 to open in browser instead of downloading.
router.get('/:id/pdf', authenticateToken, async (req, res) => {
  try {
    const label = await Label.findById(req.params.id).select('user pdfUrl awsPath trackingId');
    if (!label) return res.status(404).json({ message: 'Label not found' });

    // Only the label owner or admin can access
    if (req.user.role !== 'admin' && label.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const src = label.pdfUrl || label.awsPath;
    if (!src) return res.status(404).json({ message: 'No PDF available for this label' });

    const safeName  = `label-${label.trackingId || label._id}.pdf`;
    const inline    = req.query.inline === '1';
    const disp      = inline ? 'inline' : 'attachment';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${disp}; filename="${safeName}"`);

    // External URL (S3 or ShippersHub CDN) — fetch server-side and pipe back
    if (src.startsWith('http://') || src.startsWith('https://')) {
      const https = require('https');
      const http  = require('http');
      const mod   = src.startsWith('https') ? https : http;
      mod.get(src, (upstream) => {
        if (upstream.statusCode !== 200) {
          res.status(502).end('Could not fetch PDF from storage');
          return;
        }
        upstream.pipe(res);
      }).on('error', () => res.status(502).json({ message: 'Could not fetch PDF from storage' }));
      return;
    }

    // Local file — strip any path prefix, look in labelsDir
    const localPath = path.join(labelsDir, path.basename(src));
    if (!fs.existsSync(localPath)) {
      return res.status(404).json({ message: 'PDF file not found on server' });
    }
    fs.createReadStream(localPath).pipe(res);

  } catch (err) {
    console.error('Label PDF proxy error:', err);
    res.status(500).json({ message: 'Error serving PDF' });
  }
});

// ── POST /api/labels/zip/multi-jobs ──────────────────────────
// Combined ZIP for auto-vendor bulk mode — takes multiple bulkJobIds,
// finds their pre-built ZIPs (or falls back to local PDFs), streams one combined ZIP.
router.post('/zip/multi-jobs', authenticateToken, async (req, res) => {
  try {
    const { bulkJobIds } = req.body;
    if (!Array.isArray(bulkJobIds) || bulkJobIds.length === 0) {
      return res.status(400).json({ message: 'bulkJobIds array required' });
    }
    console.log('[multi-jobs ZIP] bulkJobIds:', bulkJobIds);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="bulk-labels-combined.zip"');

    const archive = archiver('zip', { zlib: { level: 0 } });
    archive.on('error', err => { console.error('[multi-jobs ZIP] archive error:', err); if (!res.headersSent) res.end(); });
    archive.pipe(res);

    let fileCount = 0;

    for (const bulkJobId of bulkJobIds) {
      if (!bulkJobId) continue;
      const filter = { bulkJobId, isBulk: true };
      if (req.user.role !== 'admin') filter.user = req.user._id;

      const labels = await Label.find(filter).sort({ createdAt: 1 }).lean();
      console.log(`[multi-jobs ZIP] job ${bulkJobId}: ${labels.length} labels`);

      // Prefer the pre-built ZIP stamped on the labels
      const prebuiltUrl = labels[0]?.bulkZipUrl;
      if (prebuiltUrl) {
        const prebuiltPath = path.join(zipsDir, path.basename(prebuiltUrl));
        if (fs.existsSync(prebuiltPath)) {
          console.log(`[multi-jobs ZIP] serving pre-built ZIP: ${prebuiltPath}`);
          // Re-add individual PDFs from the pre-built ZIP isn't possible without unzipper,
          // so fall through to local PDF approach
        }
      }

      // Add individual PDFs (same logic as /zip/bulk/:bulkJobId fallback)
      labels.forEach((label, i) => {
        if (!label.pdfUrl) {
          console.log(`[multi-jobs ZIP] label ${label._id} has no pdfUrl — skipping`);
          return;
        }
        const filename  = path.basename(label.pdfUrl);
        const localPath = path.join(labelsDir, filename);
        console.log(`[multi-jobs ZIP] checking ${localPath} → exists: ${fs.existsSync(localPath)}`);
        if (fs.existsSync(localPath)) {
          fileCount++;
          const name = `${String(fileCount).padStart(4, '0')}-${label.trackingId || filename}`;
          archive.file(localPath, { name: name.endsWith('.pdf') ? name : name + '.pdf' });
        }
      });
    }

    console.log(`[multi-jobs ZIP] finalizing with ${fileCount} files`);
    await archive.finalize();
  } catch (error) {
    console.error('[multi-jobs ZIP] error:', error);
    if (!res.headersSent) res.status(500).json({ message: 'Failed to build combined ZIP' });
  }
});

// ── GET /api/labels/zip/:filename ─────────────────────────────
// Download a pre-built bulk labels ZIP
router.get('/zip/:filename', authenticateToken, (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(zipsDir, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ message: 'ZIP not found' });
  }
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  fs.createReadStream(filePath).pipe(res);
});

// ── GET /api/labels/zip/bulk/:bulkJobId ───────────────────────
// Serve the pre-built ZIP if it exists, otherwise build on-the-fly from local PDFs.
// Uses STORE (level 0) — no recompression, PDF bytes remain identical to originals.
router.get('/zip/bulk/:bulkJobId', authenticateToken, async (req, res) => {
  try {
    const { bulkJobId } = req.params;
    const filter = { bulkJobId, isBulk: true };
    if (req.user.role !== 'admin') filter.user = req.user._id;

    const labels = await Label.find(filter);
    if (!labels.length) return res.status(404).json({ message: 'No labels found for this bulk job' });

    const zipName = `bulk-labels-${bulkJobId.slice(-8)}.zip`;

    // ── Prefer the pre-built ZIP stamped on the labels ────────
    const prebuiltUrl = labels[0]?.bulkZipUrl; // e.g. /api/labels/zip/bulk-xxxx.zip
    if (prebuiltUrl) {
      const prebuiltFilename = path.basename(prebuiltUrl);
      const prebuiltPath     = path.join(zipsDir, prebuiltFilename);
      if (fs.existsSync(prebuiltPath)) {
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);
        return fs.createReadStream(prebuiltPath).pipe(res);
      }
    }

    // ── Fallback: build on-the-fly from local PDFs ────────────
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

    const archive = archiver('zip', { zlib: { level: 0 } }); // STORE — no recompression
    archive.on('error', err => { console.error('ZIP stream error:', err); res.end(); });
    archive.pipe(res);

    labels.forEach((label, i) => {
      if (label.pdfUrl) {
        const filename  = path.basename(label.pdfUrl);
        const localPath = path.join(labelsDir, filename);
        if (fs.existsSync(localPath)) {
          const entry = `label-${i + 1}${label.trackingId ? '-' + label.trackingId : ''}.pdf`;
          archive.file(localPath, { name: entry });
        }
      }
    });

    await archive.finalize();
  } catch (error) {
    console.error('Bulk ZIP error:', error);
    if (!res.headersSent) res.status(500).json({ message: 'Failed to build ZIP' });
  }
});

// ── GET /api/labels/labelcrow-job/:jobId ─────────────────────
// Poll Label Crow job status. On completion, updates our Label records.
router.get('/labelcrow-job/:jobId', authenticateToken, async (req, res) => {
  try {
    const labelcrow = require('../services/labelcrow');
    const { jobId } = req.params;

    const sample = await Label.findOne({
      labelcrowJobId: jobId,
      ...(req.user.role !== 'admin' ? { user: req.user._id } : {}),
    }).select('labelcrowOrderId user');

    if (!sample) return res.status(404).json({ message: 'Job not found or access denied' });

    const progress = await labelcrow.pollJob(jobId);
    const orderId  = sample.labelcrowOrderId;

    if (progress.status === 'completed' || progress.status === 'failed') {
      const newStatus = progress.status === 'completed' ? 'generated' : 'failed';
      const zipUrl    = progress.status === 'completed' && orderId
        ? `/labels/labelcrow-order/${orderId}/zip`
        : null;

      await Label.updateMany(
        { labelcrowJobId: jobId },
        { $set: { status: newStatus, ...(zipUrl ? { bulkZipUrl: zipUrl } : {}) } }
      );

      const balance = await Balance.getOrCreateBalance(sample.user);
      return res.json({ ...progress, orderId, zipUrl, newBalance: balance.currentBalance });
    }

    return res.json(progress);
  } catch (err) {
    console.error('[LC poll]', err);
    res.status(500).json({ message: err.message || 'Polling error' });
  }
});

// ── GET /api/labels/labelcrow-order/:orderId/zip ──────────────
// Proxy-stream the Label Crow order ZIP to the authenticated user.
router.get('/labelcrow-order/:orderId/zip', authenticateToken, async (req, res) => {
  try {
    const labelcrow = require('../services/labelcrow');
    const { orderId } = req.params;

    const owns = await Label.findOne({
      labelcrowOrderId: orderId,
      ...(req.user.role !== 'admin' ? { user: req.user._id } : {}),
    }).select('_id');
    if (!owns) return res.status(404).json({ message: 'Order not found or access denied' });

    const { buffer, statusCode } = await labelcrow.downloadOrderZip(orderId);
    if (statusCode < 200 || statusCode >= 300) {
      return res.status(502).json({ message: 'Failed to fetch ZIP from Label Crow' });
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="labelcrow-order-${orderId}.zip"`);
    res.send(buffer);
  } catch (err) {
    console.error('[LC zip]', err);
    res.status(500).json({ message: err.message || 'Download error' });
  }
});

// ── GET /api/labels/:id ───────────────────────────────────────
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const label = await Label.findById(req.params.id)
      .populate('user', 'firstName lastName email')
      .populate('vendor');

    if (!label) return res.status(404).json({ message: 'Label not found' });

    const isOwner = label.user._id.toString() === req.user._id.toString();
    if (!isOwner && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json({ label });
  } catch (error) {
    console.error('Get label error:', error);
    res.status(500).json({ message: 'Server error getting label' });
  }
});

// ── GET /api/labels/shiplabel-job/:bulkJobId ──────────────────
// Poll background ShipLabel bulk job progress.
// Returns: { total, generated, failed, pending, done, labels[] }
router.get('/shiplabel-job/:bulkJobId', authenticateToken, async (req, res) => {
  try {
    const { bulkJobId } = req.params;

    const allLabels = await Label.find({
      user:     req.user._id,
      bulkJobId,
    }).select('status trackingId pdfUrl shiplabelOrderId price from_name to_name to_zip createdAt').lean();

    if (!allLabels.length) {
      return res.status(404).json({ message: 'Job not found' });
    }

    const total     = allLabels.length;
    const generated = allLabels.filter(l => l.status === 'generated').length;
    const failed    = allLabels.filter(l => l.status === 'failed').length;
    const pending   = allLabels.filter(l => l.status === 'pending').length;
    const done      = pending === 0;

    res.json({ total, generated, failed, pending, done, labels: allLabels });
  } catch (error) {
    console.error('ShipLabel job poll error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
