const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true,
    maxlength: [50, 'First name cannot exceed 50 characters']
  },
  lastName: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true,
    maxlength: [50, 'Last name cannot exceed 50 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    // Floor only — actual policy is enforced per-route (8+special for self-serve
    // accounts in auth.js, 6-digit numeric PIN for admin/reseller-created accounts
    // in users.js) since the two flows have very different password models.
    minlength: [6, 'Password must be at least 6 characters'],
    select: false
  },
  role: {
    type: String,
    enum: ['superadmin', 'admin', 'reseller', 'user'],
    default: 'user'
  },
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true,
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date
  },
  resetPasswordToken: String,
  resetPasswordExpire: Date,
  emailVerified: { type: Boolean, default: true },
  otp: String,
  otpExpire: Date,
  // For resellers - track their clients
  clients: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  // For admins - track all users they manage
  managedUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  // Lead acquisition channel — admin-only, not visible to the user
  source: {
    type: String,
    enum: ['Organic', 'Paid Ads', null],
    default: null,
  },
  phone: {
    type: String,
    trim: true,
    maxlength: [20, 'Phone number cannot exceed 20 characters'],
    default: null,
  },
  // Notification preferences
  emailNotifications: {
    type: Boolean,
    default: true,
  },
  // Credit facility — admin-controlled
  creditLimit: {
    type: Number,
    default: 0,
    min: 0,
  },
  creditUsed: {
    type: Number,
    default: 0,
    min: 0,
  },
  // Command Center delegate access — admin-granted, reseller-only
  ccAccess: {
    type: Boolean,
    default: false,
  },
  // Reseller white-label: custom names shown to this reseller's own client
  // users instead of the raw portal brand (ShippersHub / Label Crow / ShipLabel).
  // null/unset = client sees a generic neutral name, never the raw brand.
  portalLabels: {
    shippershub: { type: String, default: null, trim: true, maxlength: 40 },
    labelcrow:   { type: String, default: null, trim: true, maxlength: 40 },
    shiplabel:   { type: String, default: null, trim: true, maxlength: 40 },
  },
}, {
  timestamps: true
});

// Index for better query performance
userSchema.index({ role: 1 });
userSchema.index({ isActive: 1 });

// Hash password before saving
userSchema.pre('save', async function() {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Get full name
userSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Ensure virtual fields are serialized
userSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    ret.hasPassword = !!ret.password;
    delete ret.password;
    delete ret.resetPasswordToken;
    delete ret.resetPasswordExpire;
    delete ret.otp;
    delete ret.otpExpire;
    return ret;
  }
});

module.exports = mongoose.model('User', userSchema);
