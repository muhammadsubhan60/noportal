const mongoose = require('mongoose');

const labelSchema = new mongoose.Schema({
  // Who generated this label
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Which vendor config was used
  vendor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    default: null
  },

  // Carrier info (snapshot at time of creation)
  carrier:         { type: String, default: '' },
  vendorName:      { type: String, default: '' },
  shippingService: { type: String, default: '' },

  // ShippersHub response IDs
  shippershubLabelId: { type: String, default: null },
  trackingId:         { type: String, default: '' },

  // Label Crow async job references
  labelcrowJobId:   { type: String, default: null },
  labelcrowOrderId: { type: String, default: null },

  // ShipLabel order reference
  shiplabelOrderId: { type: String, default: null },

  // From address
  from_name:     { type: String, default: '' },
  from_company:  { type: String, default: '' },
  from_phone:    { type: String, default: '' },
  from_address1: { type: String, default: '' },
  from_address2: { type: String, default: '' },
  from_city:     { type: String, default: '' },
  from_state:    { type: String, default: '' },
  from_zip:      { type: String, default: '' },
  from_country:  { type: String, default: 'USA' },

  // To address
  to_name:     { type: String, default: '' },
  to_company:  { type: String, default: '' },
  to_phone:    { type: String, default: '' },
  to_address1: { type: String, default: '' },
  to_address2: { type: String, default: '' },
  to_city:     { type: String, default: '' },
  to_state:    { type: String, default: '' },
  to_zip:      { type: String, default: '' },
  to_country:  { type: String, default: 'USA' },

  // Package
  weight: { type: Number, default: 0 },
  length: { type: Number, default: 0 },
  width:  { type: Number, default: 0 },
  height: { type: Number, default: 0 },
  note:   { type: String, default: '' },

  // Price charged to user
  price: { type: Number, default: 0 },

  // PDF / download
  pdfUrl:  { type: String, default: null },
  awsKey:  { type: String, default: null },
  awsPath: { type: String, default: null },

  // Bulk job reference
  isBulk:      { type: Boolean, default: false },
  bulkJobId:   { type: String, default: null },
  bulkFileName:{ type: String, default: '' },
  bulkZipUrl:  { type: String, default: null }, // pre-built ZIP URL for the whole batch

  status: {
    type: String,
    enum: ['generated', 'failed', 'cancelled', 'pending'],
    default: 'generated'
  },

  trackingStatus: {
    type: String,
    enum: ['not_scanned_yet', 'in_transit', 'out_for_delivery', 'delivered', 'exception_problem', 'returned_to_sender', 'pending_pickup', 'delayed', 'voided'],
    default: 'not_scanned_yet'
  },

  trackingStatusHistory: [{
    status:    { type: String, required: true },
    note:      { type: String, default: '' },
    updatedAt: { type: Date,   default: Date.now },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  }]
}, {
  timestamps: true
});

// Index for fast user lookups
labelSchema.index({ user: 1, createdAt: -1 });
labelSchema.index({ trackingId: 1 });

module.exports = mongoose.model('Label', labelSchema);
