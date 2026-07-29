const express  = require('express');
const { authenticateToken, authorize } = require('../middleware/auth');
const ApiCredential = require('../models/ApiCredential');
const shiplabel     = require('../services/shiplabel');
const labelcrow      = require('../services/labelcrow');

const router = express.Router();

// All routes: authenticated + admin only
router.use(authenticateToken, authorize('admin'));

// Providers this endpoint manages, with their env var fallback name and a
// lightweight read-only call used to verify a key actually works.
const PROVIDERS = {
  shiplabel: { envVar: 'SHIPLABEL_API_KEY', test: () => shiplabel.getServices() },
  labelcrow: { envVar: 'LABELCROW_API_KEY', test: () => labelcrow.getSeries() },
};

function requireKnownProvider(req, res, next) {
  if (!PROVIDERS[req.params.provider]) {
    return res.status(404).json({ message: `Unknown provider "${req.params.provider}"` });
  }
  next();
}

// ── GET /api/api-credentials ──────────────────────────────────────────────────
// Status for every supported provider (key never returned, only last 4 chars)
router.get('/', async (req, res) => {
  try {
    const docs = await ApiCredential.find();
    const byProvider = Object.fromEntries(docs.map(d => [d.provider, d]));

    const credentials = Object.keys(PROVIDERS).map((provider) => {
      const doc = byProvider[provider];
      const envConfigured = !!process.env[PROVIDERS[provider].envVar];
      return {
        provider,
        configured: !!doc || envConfigured,
        source: doc ? 'database' : envConfigured ? 'env' : 'none',
        last4: doc ? doc.last4 : null,
        testedAt: doc ? doc.testedAt : null,
        testStatus: doc ? doc.testStatus : null,
      };
    });

    res.json({ credentials });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PUT /api/api-credentials/:provider ────────────────────────────────────────
// Set or replace the stored API key for a provider
router.put('/:provider', requireKnownProvider, async (req, res) => {
  try {
    const { apiKey } = req.body;
    if (!apiKey || !apiKey.trim()) {
      return res.status(400).json({ message: 'apiKey is required' });
    }

    let doc = await ApiCredential.findOne({ provider: req.params.provider });
    if (!doc) {
      doc = new ApiCredential({ provider: req.params.provider, encryptedApiKey: '', iv: '', last4: '' });
    }
    doc.setApiKey(apiKey.trim());
    // Key changed — previous test result no longer applies
    doc.testedAt = null;
    doc.testStatus = null;
    await doc.save();

    res.json({ message: 'API key saved', last4: doc.last4 });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── DELETE /api/api-credentials/:provider ─────────────────────────────────────
// Remove the stored key (falls back to the env var, if set)
router.delete('/:provider', requireKnownProvider, async (req, res) => {
  try {
    await ApiCredential.deleteOne({ provider: req.params.provider });
    res.json({ message: 'API key removed' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/api-credentials/:provider/test ──────────────────────────────────
// Verify the currently active key (DB, or env var fallback) actually works
router.post('/:provider/test', requireKnownProvider, async (req, res) => {
  const doc = await ApiCredential.findOne({ provider: req.params.provider });
  try {
    await PROVIDERS[req.params.provider].test();

    if (doc) {
      doc.testedAt = new Date();
      doc.testStatus = 'success';
      await doc.save();
    }
    res.json({ message: 'Connection successful', testedAt: doc ? doc.testedAt : new Date() });
  } catch (err) {
    if (doc) {
      doc.testedAt = new Date();
      doc.testStatus = 'failed';
      await doc.save();
    }
    res.status(400).json({ message: `Connection failed: ${err.message}` });
  }
});

module.exports = router;
