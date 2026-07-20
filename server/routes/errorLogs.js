const express  = require('express');
const ErrorLog = require('../models/ErrorLog');
const { authenticateToken, authorize } = require('../middleware/auth');

const router = express.Router();
const PAGE_LIMIT_MAX = 100;

// ── GET /api/error-logs ────────────────────────────────────────
// Admin-only, paginated + filterable feed of real label-generation failures.
router.get('/', authenticateToken, authorize('admin'), async (req, res) => {
  try {
    const page  = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 50, PAGE_LIMIT_MAX);

    const filter = {};
    if (req.query.carrier) filter.carrier = req.query.carrier;
    if (req.query.portal)  filter.portal  = req.query.portal;
    if (req.query.source)  filter.source  = req.query.source;
    if (req.query.isBulk === 'true' || req.query.isBulk === 'false') {
      filter.isBulk = req.query.isBulk === 'true';
    }
    if (req.query.from || req.query.to) {
      filter.createdAt = {};
      if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
      if (req.query.to)   filter.createdAt.$lte = new Date(req.query.to);
    }

    const [logs, total] = await Promise.all([
      ErrorLog.find(filter)
        .populate('user', 'firstName lastName email role')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      ErrorLog.countDocuments(filter),
    ]);

    res.json({ logs, total, page, pages: Math.ceil(total / limit) || 1 });
  } catch (err) {
    console.error('Get error logs error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── GET /api/error-logs/summary ───────────────────────────────
// Lightweight counts for a nav badge — last 24h + all-time.
router.get('/summary', authenticateToken, authorize('admin'), async (req, res) => {
  try {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [last24h, total] = await Promise.all([
      ErrorLog.countDocuments({ createdAt: { $gte: since24h } }),
      ErrorLog.countDocuments({}),
    ]);
    res.json({ last24h, total });
  } catch (err) {
    console.error('Get error log summary error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
