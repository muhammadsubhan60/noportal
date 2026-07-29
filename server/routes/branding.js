const express  = require('express');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const { authenticateToken } = require('../middleware/auth');
const Branding = require('../models/Branding');

const router = express.Router();

// ── Logo upload setup ─────────────────────────────────────────
const logosDir = path.join(__dirname, '../uploads/branding');
if (!fs.existsSync(logosDir)) fs.mkdirSync(logosDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, logosDir),
  filename: (req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    const name = `logo-${req.user._id}-${Date.now()}${ext}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.png', '.jpg', '.jpeg', '.svg', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Only PNG, JPG, SVG, or WEBP images are allowed'));
  },
});

const toPayload = (doc) => ({
  orgName: doc?.orgName || '',
  logoUrl: doc?.logoFilename ? `/api/branding/logo/${doc.logoFilename}` : null,
});

// ── GET /api/branding ────────────────────────────────────────
// Every authenticated user has their own branding (sidebar name + logo).
router.get('/', authenticateToken, async (req, res) => {
  try {
    const doc = await Branding.findOne({ user: req.user._id });
    res.json(toPayload(doc));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/branding/logo/:filename ───────────────────────────
// Serve a logo file — no auth required (filenames are random, and each is
// shown in that user's own sidebar so there's nothing sensitive to protect).
router.get('/logo/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(logosDir, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ message: 'Not found' });
  res.sendFile(filePath);
});

// ── PUT /api/branding ───────────────────────────────────────────
// Any authenticated user sets their own org name and/or uploads their own logo.
router.put('/', authenticateToken, upload.single('logo'), async (req, res) => {
  try {
    let doc = await Branding.findOne({ user: req.user._id });
    if (!doc) doc = new Branding({ user: req.user._id });

    if (typeof req.body.orgName === 'string') {
      doc.orgName = req.body.orgName.trim().slice(0, 60);
    }

    if (req.file) {
      const previousFilename = doc.logoFilename;
      doc.logoFilename = req.file.filename;
      if (previousFilename) {
        fs.unlink(path.join(logosDir, previousFilename), () => {});
      }
    }

    await doc.save();
    res.json(toPayload(doc));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── DELETE /api/branding/logo ────────────────────────────────────
// Remove just the caller's uploaded logo (keeps their org name).
router.delete('/logo', authenticateToken, async (req, res) => {
  try {
    const doc = await Branding.findOne({ user: req.user._id });
    if (doc?.logoFilename) {
      fs.unlink(path.join(logosDir, doc.logoFilename), () => {});
      doc.logoFilename = null;
      await doc.save();
    }
    res.json(toPayload(doc));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
