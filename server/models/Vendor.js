const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const vendorSchema = new mongoose.Schema({
  // Display name e.g. "USPS Ground via EasyPost"
  name: {
    type: String,
    required: true,
    trim: true
  },

  // Carrier brand
  carrier: {
    type: String,
    enum: ['USPS', 'UPS', 'FedEx', 'DHL'],
    required: true
  },

  // ShippersHub references (only for USPS via ShippersHub)
  shippershubCarrierId: { type: String, default: null },
  shippershubVendorId:  { type: String, default: null },

  // Service type e.g. "ground", "priority", "express"
  shippingService: { type: String, default: '' },

  // Rate per label (admin controlled)
  rate: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },

  // Optional rate range for display (e.g. $0.45 – $1.20)
  rateMin: { type: Number, default: null },
  rateMax: { type: Number, default: null },

  // Which roles can see this vendor
  visibleToRoles: {
    type: [String],
    enum: ['admin', 'reseller', 'user'],
    default: ['admin', 'reseller', 'user']
  },

  // Specific users who can see this vendor (empty = all users of allowed roles)
  visibleToUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

  isActive: { type: Boolean, default: true },

  description: { type: String, default: '' },

  // Source / portal: 'shippershub' | 'manual' | 'labelcrow'
  source: {
    type: String,
    enum: ['shippershub', 'manual', 'labelcrow', 'shiplabel'],
    default: 'shippershub'
  },

  // ── Label Crow vendor fields (source === 'labelcrow') ─────────
  labelcrowSeriesId:    { type: Number, default: null },
  labelcrowProviderKey: { type: String, default: null },
  labelcrowServiceClass:{ type: String, default: null }, // 'priority' | 'ground'

  // ── ShipLabel vendor fields (source === 'shiplabel') ──────────
  shiplabelServiceId:   { type: String, default: null }, // service id from /api/v2/services
  shiplabelLabelSeries: { type: String, default: null }, // legacy single series, e.g. '9505'
  shiplabelLabelFormat: { type: String, default: null }, // legacy single format, e.g. 'usps_priority_mail'
  // Multi-series: each entry is a selectable option shown to users. Empty by
  // default — every existing vendor falls back to the legacy single series/format above.
  shiplabelSeries: {
    type: [{
      series: { type: String, required: true },
      format: { type: String, required: true },
      name:   { type: String, default: '' },
      _id: false,
    }],
    default: [],
  },

  // Vendor type: 'api' = non-manifest API label generation | 'manifest' = manual manifest pricing entry
  vendorType: {
    type: String,
    enum: ['api', 'manifest'],
    default: 'api'
  },

  // ── Vendor Portal Credentials ─────────────────────────────
  // Vendors log into a separate neutral portal (no Label Flow branding)
  vendorPortalEmail:    { type: String, unique: true, sparse: true, lowercase: true, trim: true },
  vendorPortalPassword: { type: String, select: false },
  vendorPortalIsActive: { type: Boolean, default: false },

  // Contact email for job notifications (can differ from portal login)
  vendorContactEmail: { type: String, default: '' },

  // ── Vendor Finance ────────────────────────────────────────
  // Per-label rate Label Flow owes this vendor for manifested jobs
  vendorRate:      { type: Number, default: 0, min: 0 },
  // Running payable balance (added when admin approves a job)
  dueBalance:      { type: Number, default: 0 },
  // Lifetime total credited to vendor
  totalEarnings:   { type: Number, default: 0 },

}, {
  timestamps: true
});

// Hash vendor portal password before saving
vendorSchema.pre('save', async function () {
  if (!this.isModified('vendorPortalPassword') || !this.vendorPortalPassword) return;
  const salt = await bcrypt.genSalt(12);
  this.vendorPortalPassword = await bcrypt.hash(this.vendorPortalPassword, salt);
});

vendorSchema.methods.comparePortalPassword = async function (candidate) {
  return bcrypt.compare(candidate, this.vendorPortalPassword);
};

module.exports = mongoose.model('Vendor', vendorSchema);
