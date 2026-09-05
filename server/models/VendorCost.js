const mongoose = require('mongoose');

/**
 * VendorCost — admin sets the per-label cost for each carrier (and vendor) per month.
 *
 * USPS (ShippersHub, non-manifest):   vendorName = null  → one cumulative rate covers all USPS labels.
 * UPS / FedEx / DHL (manifest):       vendorName = the Vendor name  → per-vendor rate.
 *
 * Unique index prevents duplicate entries for the same carrier+vendor+month+year.
 */
const vendorCostSchema = new mongoose.Schema({
  carrier: {
    type: String,
    enum: ['USPS', 'UPS', 'FedEx', 'DHL'],
    required: true,
  },
  // Null means "all vendors for this carrier" (used for USPS / ShippersHub)
  vendorName: {
    type: String,
    default: null,
    trim: true,
  },
  month: {
    type: Number,
    required: true,
    min: 1,
    max: 12,
  },
  year: {
    type: Number,
    required: true,
  },
  costPerLabelUSD: {
    type: Number,
    required: true,
    min: 0,
  },
  setBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
}, { timestamps: true });

vendorCostSchema.index({ carrier: 1, vendorName: 1, month: 1, year: 1 }, { unique: true });

module.exports = mongoose.model('VendorCost', vendorCostSchema);
