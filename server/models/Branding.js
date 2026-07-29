const mongoose = require('mongoose');

// One document per user — each end user can brand their own sidebar.
const brandingSchema = new mongoose.Schema({
  user:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  orgName:      { type: String, default: '', trim: true, maxlength: 60 },
  logoFilename: { type: String, default: null },
}, { timestamps: true });

module.exports = mongoose.model('Branding', brandingSchema);
