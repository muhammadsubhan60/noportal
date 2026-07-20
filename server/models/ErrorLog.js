const mongoose = require('mongoose');

// Admin-only visibility into real label-generation failures (single + bulk).
// Never exposed to end users — see server/routes/errorLogs.js.
const errorLogSchema = new mongoose.Schema({
  user:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },

  vendor:     { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', default: null },
  vendorName: { type: String, default: '' },
  carrier:    { type: String, default: '' },
  portal:     { type: String, enum: ['shippershub', 'labelcrow', 'shiplabel', 'manual', null], default: null },

  isBulk:    { type: Boolean, default: false },
  bulkJobId: { type: String, default: null },

  // Which code path raised this, e.g. 'single-label', 'bulk-labelcrow-submit', 'bulk-shiplabel-row'
  source:     { type: String, required: true },
  message:    { type: String, required: true, maxlength: 1000 },
  httpStatus: { type: Number, default: null },
}, { timestamps: true });

errorLogSchema.index({ createdAt: -1 });
errorLogSchema.index({ carrier: 1, createdAt: -1 });

module.exports = mongoose.model('ErrorLog', errorLogSchema);
