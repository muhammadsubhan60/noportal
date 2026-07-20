const mongoose = require('mongoose');

const rateTierSchema = new mongoose.Schema({
  minLbs: { type: Number, required: true, default: 0 },
  maxLbs: { type: Number, default: null }, // null = no upper limit
  rate:   { type: Number, required: true, min: 0 },
}, { _id: false });

const userVendorAccessSchema = new mongoose.Schema({
  user:      { type: mongoose.Schema.Types.ObjectId, ref: 'User',           required: true },
  vendor:    { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
  carrier:   { type: String, required: true },
  isAllowed: { type: Boolean, default: true },
  // Weight-based rate tiers — if empty, falls back to vendor.vendorRate
  rateTiers: [rateTierSchema],
  // ShipLabel multi-series vendors: which series this user may pick. Empty = all allowed.
  allowedShiplabelSeries: { type: [String], default: [] },
}, { timestamps: true });

// One record per user + vendor + carrier combination
// (a vendor can serve multiple carriers, so rates differ per carrier)
userVendorAccessSchema.index({ user: 1, vendor: 1, carrier: 1 }, { unique: true });

// Helper: find the matching rate tier for a given weight (in lbs)
userVendorAccessSchema.methods.getRateForWeight = function (weightLbs) {
  if (!this.rateTiers || this.rateTiers.length === 0) return null;
  const tier = this.rateTiers.find(t =>
    weightLbs >= t.minLbs && (t.maxLbs === null || weightLbs <= t.maxLbs)
  );
  return tier ? tier.rate : null;
};

module.exports = mongoose.model('UserVendorAccess', userVendorAccessSchema);
