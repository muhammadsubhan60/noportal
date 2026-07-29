const mongoose = require('mongoose');
const { encrypt, decrypt } = require('../utils/credentialCrypto');

// ── Schema ────────────────────────────────────────────────────────────────────
// Stores a single API key per label provider (ShipLabel, Label Crow), encrypted
// at rest. When no document exists for a provider, services fall back to that
// provider's *_API_KEY environment variable.
const apiCredentialSchema = new mongoose.Schema({
  provider: {
    type: String,
    required: true,
    enum: ['shiplabel', 'labelcrow'],
    unique: true,
  },
  encryptedApiKey: {
    type: String,
    required: true,
  },
  iv: {
    type: String,
    required: true,
  },
  // Last 4 characters of the key, stored in plain text for display purposes only
  last4: {
    type: String,
    required: true,
  },
  testedAt: {
    type: Date,
    default: null,
  },
  testStatus: {
    type: String,
    enum: ['success', 'failed', null],
    default: null,
  },
}, {
  timestamps: true,
});

// Instance method: decrypt API key on demand
apiCredentialSchema.methods.getApiKey = function () {
  return decrypt(this.encryptedApiKey, this.iv, this.provider);
};

// Instance method: set a new plain-text API key (encrypts in place)
apiCredentialSchema.methods.setApiKey = function (plainText) {
  const { encrypted, iv } = encrypt(plainText, this.provider);
  this.encryptedApiKey = encrypted;
  this.iv = iv;
  this.last4 = plainText.slice(-4);
};

// Never expose encrypted fields in JSON responses
apiCredentialSchema.set('toJSON', {
  transform(doc, ret) {
    delete ret.encryptedApiKey;
    delete ret.iv;
    return ret;
  },
});

module.exports = mongoose.model('ApiCredential', apiCredentialSchema);
