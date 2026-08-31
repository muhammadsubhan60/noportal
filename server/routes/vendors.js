const express = require('express');
const { body, validationResult } = require('express-validator');
const Vendor = require('../models/Vendor');
const { authenticateToken, authorize } = require('../middleware/auth');
const shippershub = require('../services/shippershub');

const router = express.Router();

// ── GET /api/vendors ──────────────────────────────────────────
// Admin: list all vendors | User/Reseller: their visible vendors
router.get('/', authenticateToken, async (req, res) => {
  try {
    const filter = req.user.role === 'admin' ? {} : { isActive: true, visibleToRoles: req.user.role };
    const vendors = await Vendor.find(filter).sort({ carrier: 1, name: 1 });
    res.json({ vendors });
  } catch (error) {
    console.error('Get vendors error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── POST /api/vendors ─────────────────────────────────────────
// Admin: create a vendor
router.post('/', authenticateToken, authorize('admin'), [
  body('name').notEmpty().withMessage('Vendor name is required'),
  body('carrier').isIn(['USPS', 'UPS', 'FedEx', 'DHL']).withMessage('Invalid carrier'),
  body('rate').isFloat({ min: 0 }).withMessage('Rate must be a non-negative number'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
    }

    const {
      name, carrier, rate, rateMin, rateMax,
      shippershubCarrierId, shippershubVendorId,
      shippingService, visibleToRoles, isActive, description, source,
      vendorContactEmail, vendorPortalEmail, vendorPortalPassword,
      vendorPortalIsActive, vendorRate, vendorType,
    } = req.body;

    const vendor = new Vendor({
      name, carrier, rate,
      vendorType:           vendorType || 'api',
      rateMin:              rateMin || null,
      rateMax:              rateMax || null,
      shippershubCarrierId: shippershubCarrierId || null,
      shippershubVendorId:  shippershubVendorId  || null,
      shippingService:      shippingService || '',
      visibleToRoles:       visibleToRoles  || ['admin', 'reseller', 'user'],
      isActive:             isActive !== undefined ? isActive : true,
      description:          description || '',
      source:               source || 'shippershub',
      vendorContactEmail:   vendorContactEmail   || '',
      vendorPortalEmail:    vendorPortalEmail     || undefined,
      vendorPortalIsActive: vendorPortalIsActive  || false,
      vendorRate:           vendorRate            || 0,
    });

    if (vendorPortalPassword && vendorPortalPassword.trim()) {
      vendor.vendorPortalPassword = vendorPortalPassword; // pre-save will hash
    }

    await vendor.save();

    res.status(201).json({ message: 'Vendor created successfully', vendor });
  } catch (error) {
    console.error('Create vendor error:', error);
    res.status(500).json({ message: 'Server error creating vendor' });
  }
});

// ── PUT /api/vendors/:id ──────────────────────────────────────
router.put('/:id', authenticateToken, authorize('admin'), async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    // Apply all fields from request body
    const { vendorPortalPassword, ...rest } = req.body;

    Object.assign(vendor, rest);

    // Only update password if a new one was explicitly provided
    if (vendorPortalPassword && vendorPortalPassword.trim()) {
      vendor.vendorPortalPassword = vendorPortalPassword; // pre-save hook will hash it
    }

    await vendor.save(); // triggers bcrypt pre-save hook
    res.json({ message: 'Vendor updated', vendor });
  } catch (error) {
    console.error('Update vendor error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── DELETE /api/vendors/:id ───────────────────────────────────
router.delete('/:id', authenticateToken, authorize('admin'), async (req, res) => {
  try {
    const vendor = await Vendor.findByIdAndDelete(req.params.id);
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });
    res.json({ message: 'Vendor deleted' });
  } catch (error) {
    console.error('Delete vendor error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── POST /api/vendors/import-from-shippershub ─────────────────
// Admin: full sync — creates new, updates existing, deactivates removed
router.post('/import-from-shippershub', authenticateToken, authorize('admin'), async (req, res) => {
  try {
    const carriers = await shippershub.getMyCarriers();

    // Collect all vendor IDs currently available in ShippersHub
    const liveVendorIds = [];
    const created  = [];
    const updated  = [];

    for (const carrier of carriers) {
      const vendors = await shippershub.getMyVendors(carrier._id);
      for (const v of vendors) {
        liveVendorIds.push(v._id);

        const carrierName = carrier.name.toUpperCase().includes('USPS')  ? 'USPS'
                          : carrier.name.toUpperCase().includes('UPS')   ? 'UPS'
                          : carrier.name.toUpperCase().includes('FEDEX') ? 'FedEx' : 'DHL';

        const existing = await Vendor.findOne({ shippershubVendorId: v._id });
        if (!existing) {
          await Vendor.create({
            name:                 v.name,
            carrier:              carrierName,
            shippershubCarrierId: carrier._id,
            shippershubVendorId:  v._id,
            shippingService:      v.shippingService || '',
            rate:                 v.rate || 0,
            isActive:             v.status === 'active',
            source:               'shippershub'
          });
          created.push(v.name);
        } else {
          // Update name & status to match ShippersHub, preserve admin-set rate
          existing.name            = v.name;
          existing.shippingService = v.shippingService || existing.shippingService;
          existing.isActive        = v.status === 'active';
          await existing.save();
          updated.push(v.name);
        }
      }
    }

    // Deactivate any ShippersHub vendor no longer returned by the API
    const deactivated = await Vendor.updateMany(
      { source: 'shippershub', shippershubVendorId: { $nin: liveVendorIds } },
      { isActive: false }
    );

    res.json({
      message: `Sync complete — ${created.length} added, ${updated.length} updated, ${deactivated.modifiedCount} deactivated`,
      created, updated
    });
  } catch (error) {
    console.error('Import ShippersHub vendors error:', error);
    res.status(502).json({ message: `ShippersHub error: ${error.message}` });
  }
});

// ── POST /api/vendors/import-from-labelcrow ───────────────────
// Admin: sync Label Crow series × provider_key combos as Vendor records
router.post('/import-from-labelcrow', authenticateToken, authorize('admin'), async (req, res) => {
  try {
    const labelcrow = require('../services/labelcrow');
    const [seriesList, providersRaw] = await Promise.all([
      labelcrow.getSeries(),
      labelcrow.getProviders(),
    ]);

    // Build map: 'carrier:service_class' → Set<provider_key>
    // API response is a flat array of { carrier, service_class, provider_key }
    const providerMap = new Map();
    for (const p of providersRaw) {
      const k = `${p.carrier}:${p.service_class}`;
      if (!providerMap.has(k)) providerMap.set(k, new Set());
      if (p.provider_key) providerMap.get(k).add(p.provider_key);
    }

    const created = [];
    const updated = [];

    for (const series of seriesList) {
      const k = `${series.carrier}:${series.service_class}`;
      const pkeys = providerMap.has(k) ? [...providerMap.get(k)] : [''];
      const rateVal = series.price_brackets?.[0]?.price ?? 0;
      const svc = series.service_class;
      const svcLabel = svc.charAt(0).toUpperCase() + svc.slice(1);

      for (const providerKey of pkeys) {
        const vendorName = providerKey
          ? `${series.series_code} · ${svcLabel} · ${providerKey}`
          : `${series.series_code} · ${svcLabel}`;

        const filter = {
          source: 'labelcrow',
          labelcrowSeriesId: series.id,
          labelcrowProviderKey: providerKey,
        };

        const existing = await Vendor.findOne(filter);
        if (!existing) {
          await Vendor.create({
            name:                  vendorName,
            carrier:               'USPS',
            source:                'labelcrow',
            vendorType:            'api',
            shippingService:       svc,
            rate:                  rateVal,
            isActive:              true,
            labelcrowSeriesId:     series.id,
            labelcrowProviderKey:  providerKey,
            labelcrowServiceClass: svc,
          });
          created.push(vendorName);
        } else {
          await Vendor.updateOne(filter, {
            $set: { name: vendorName, shippingService: svc, labelcrowServiceClass: svc },
          });
          updated.push(vendorName);
        }
      }
    }

    res.json({
      message: `Label Crow sync — ${created.length} added, ${updated.length} updated`,
      created,
      updated,
    });
  } catch (error) {
    console.error('Import Label Crow vendors error:', error);
    res.status(502).json({ message: `Label Crow error: ${error.message}` });
  }
});

// ── POST /api/vendors/import-from-shiplabel ───────────────────
// Admin: sync ShipLabel services as Vendor records
router.post('/import-from-shiplabel', authenticateToken, authorize('admin'), async (req, res) => {
  try {
    const shiplabel = require('../services/shiplabel');
    const services  = await shiplabel.getServices();

    const created = [];
    const updated = [];

    for (const svc of services) {
      // Parse rate from first price range (strip "$" and " lbs")
      const rawPrice = svc.price_ranges?.[0]?.price || '$0';
      const rateVal  = parseFloat(rawPrice.replace(/[^0-9.]/g, '')) || 0;

      const filter = { source: 'shiplabel', shiplabelServiceId: String(svc.id) };
      const existing = await Vendor.findOne(filter);

      if (!existing) {
        await Vendor.create({
          name:                 svc.name,
          carrier:              'USPS',
          source:               'shiplabel',
          vendorType:           'api',
          shippingService:      svc.inferredFormat || '',
          rate:                 rateVal,
          isActive:             true,
          shiplabelServiceId:   String(svc.id),
          shiplabelLabelSeries: svc.inferredSeries || '',
          shiplabelLabelFormat: svc.inferredFormat || '',
        });
        created.push(svc.name);
      } else {
        await Vendor.updateOne(filter, {
          $set: { name: svc.name, shippingService: svc.inferredFormat || existing.shippingService },
        });
        updated.push(svc.name);
      }
    }

    res.json({
      message: `ShipLabel sync — ${created.length} added, ${updated.length} updated`,
      created,
      updated,
    });
  } catch (error) {
    console.error('Import ShipLabel vendors error:', error);
    res.status(502).json({ message: `ShipLabel error: ${error.message}` });
  }
});

// ── POST /api/vendors/shiplabel-custom ────────────────────────
// Admin: create standalone ShipLabel vendors off the "Custom Label (Series &
// Format)" service. `series` and `format` may each be a string or an array; one
// vendor is created per series × format pair. Each becomes its own vendor row —
// independently activatable and grantable to users. Existing pairs are skipped.
router.post('/shiplabel-custom', authenticateToken, authorize('admin'), async (req, res) => {
  try {
    const toList = v => [...new Set(
      (Array.isArray(v) ? v : [v]).map(x => String(x == null ? '' : x).trim()).filter(Boolean)
    )];
    const seriesList = toList(req.body.series);
    const formatList = toList(req.body.format);
    const name       = String(req.body.name || '').trim();
    const rate       = Number(req.body.rate) || 0;

    if (!seriesList.length || !formatList.length) {
      return res.status(400).json({ message: 'At least one series and one format are required' });
    }

    // Resolve the Custom Label service id from an already-synced vendor;
    // fall back to a live ShipLabel lookup only if none exists yet.
    const synced = await Vendor.findOne({
      source: 'shiplabel',
      name: { $regex: '^Custom Label \\(Series & Format\\)' },
    });
    let serviceId = synced?.shiplabelServiceId || null;

    if (!serviceId) {
      const shiplabel = require('../services/shiplabel');
      const services  = await shiplabel.getServices();
      const custom    = services.find(s => s.name === 'Custom Label (Series & Format)');
      if (!custom) {
        return res.status(502).json({ message: 'No "Custom Label (Series & Format)" service on this ShipLabel account' });
      }
      serviceId = String(custom.id);
    }

    const single = seriesList.length === 1 && formatList.length === 1;
    const created = [];
    const skipped = [];

    for (const series of seriesList) {
      for (const format of formatList) {
        const key = {
          source: 'shiplabel',
          shiplabelServiceId:   serviceId,
          shiplabelLabelSeries: series,
          shiplabelLabelFormat: format,
        };
        if (await Vendor.findOne(key)) { skipped.push(`${series} · ${format}`); continue; }

        const vendor = await Vendor.create({
          ...key,
          name:            (single && name) ? name : `Custom · ${series} · ${format}`,
          carrier:         'USPS',
          vendorType:      'api',
          shippingService: format,
          rate,
          isActive:        true,
          visibleToRoles:  ['admin', 'reseller', 'user'],
        });
        created.push(vendor.name);
      }
    }

    res.status(201).json({
      message: `${created.length} vendor${created.length !== 1 ? 's' : ''} created`
        + (skipped.length ? `, ${skipped.length} already existed` : ''),
      created,
      skipped,
    });
  } catch (error) {
    console.error('Create custom ShipLabel vendor error:', error);
    res.status(500).json({ message: `Server error: ${error.message}` });
  }
});

module.exports = router;
