const mongoose = require('mongoose');

const timelineEventSchema = new mongoose.Schema({
  status:      { type: String },
  note:        { type: String },
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  timestamp:   { type: Date, default: Date.now },
}, { _id: false });

const billingBreakdownSchema = new mongoose.Schema({
  rate:     Number,
  count:    Number,
  subtotal: Number,
}, { _id: false });

const manifestJobSchema = new mongoose.Schema({

  // ── Core ──────────────────────────────────────────────────
  user:    { type: mongoose.Schema.Types.ObjectId, ref: 'User',   required: true },
  carrier: { type: String, enum: ['USPS', 'UPS', 'FedEx', 'DHL'], required: true },
  vendor:  { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', default: null },

  // ── Status ────────────────────────────────────────────────
  // open      → waiting for admin to produce and upload the result file
  // completed → admin uploaded the result; user can download
  // cancelled → job cancelled (balance refunded if user-initiated)
  status: {
    type: String,
    enum: ['open', 'completed', 'cancelled'],
    default: 'open',
  },

  // ── Request file (uploaded by user) ───────────────────────
  requestFile: {
    originalName: String,
    storedName:   String,
    path:         String,
    labelCount:   { type: Number, default: 0 },
  },

  // ── Result file (uploaded by admin) ───────────────────────
  resultFile: {
    originalName: String,
    storedName:   String,
    path:         String,
    uploadedAt:   Date,
  },

  // ── User billing (deducted at submission, tier-based) ─────
  userBilling: {
    labelCount:  { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    deducted:    { type: Boolean, default: false },
    deductedAt:  Date,
    breakdown:   [billingBreakdownSchema],
  },

  // ── Timestamps for key events ─────────────────────────────
  completedAt:        Date,
  cancelledAt:        Date,
  cancelledBy:        { type: String, enum: ['admin', 'user', null], default: null },
  cancellationReason: String,
  adminNotes:         String,

  // ── Audit trail ───────────────────────────────────────────
  timeline: [timelineEventSchema],

}, { timestamps: true });

manifestJobSchema.index({ user: 1, status: 1 });
manifestJobSchema.index({ carrier: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('ManifestJob', manifestJobSchema);
