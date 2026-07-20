const express    = require('express');
const Suggestion = require('../models/Suggestion');
const { authenticateToken, authorize } = require('../middleware/auth');

const router = express.Router();

// ── GET /api/suggestions ──────────────────────────────────────────────────
// Users see only approved; admin sees everything
router.get('/', authenticateToken, async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin';
    const query   = isAdmin ? {} : { isApproved: true };

    const raw = await Suggestion.find(query)
      .sort({ isPinned: -1, createdAt: -1 })
      .lean();

    const uid = req.user._id.toString();
    const suggestions = raw.map(s => ({
      ...s,
      upvoteCount: s.upvotes.length,
      hasUpvoted:  s.upvotes.some(id => id.toString() === uid),
    }));

    // sort approved by upvotes; pending ones stay at top for admin
    const approved = suggestions.filter(s => s.isApproved)
      .sort((a, b) => b.upvoteCount - a.upvoteCount || new Date(b.createdAt) - new Date(a.createdAt));
    const pending  = suggestions.filter(s => !s.isApproved);

    res.json({ suggestions: isAdmin ? [...pending, ...approved] : approved });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── POST /api/suggestions ─────────────────────────────────────────────────
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { title, description, category, imageData } = req.body;
    if (!title || !description || !category)
      return res.status(400).json({ message: 'Title, description and category are required' });

    const isAdmin = req.user.role === 'admin';
    const s = await Suggestion.create({
      title:       title.trim(),
      description: description.trim(),
      category,
      imageData:   imageData || null,
      author:      req.user._id,
      authorName:  `${req.user.firstName} ${req.user.lastName}`,
      isApproved:  isAdmin, // admin posts go live immediately
    });

    res.status(201).json({ suggestion: s });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── PUT /api/suggestions/:id — edit (author or admin) ─────────────────────
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const s = await Suggestion.findById(req.params.id);
    if (!s) return res.status(404).json({ message: 'Not found' });

    const isOwner = s.author.toString() === req.user._id.toString();
    if (!isOwner && req.user.role !== 'admin')
      return res.status(403).json({ message: 'Forbidden' });

    const { title, description, category, imageData } = req.body;
    if (title)       s.title       = title.trim();
    if (description) s.description = description.trim();
    if (category)    s.category    = category;
    if (imageData !== undefined) s.imageData = imageData || null;

    await s.save();
    res.json({ suggestion: s });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── DELETE /api/suggestions/:id ───────────────────────────────────────────
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const s = await Suggestion.findById(req.params.id);
    if (!s) return res.status(404).json({ message: 'Not found' });

    const isOwner = s.author.toString() === req.user._id.toString();
    if (!isOwner && req.user.role !== 'admin')
      return res.status(403).json({ message: 'Forbidden' });

    await s.deleteOne();
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── POST /api/suggestions/:id/upvote — toggle ─────────────────────────────
router.post('/:id/upvote', authenticateToken, async (req, res) => {
  try {
    const s = await Suggestion.findOne({ _id: req.params.id, isApproved: true });
    if (!s) return res.status(404).json({ message: 'Not found' });

    const uid = req.user._id.toString();
    const idx = s.upvotes.findIndex(id => id.toString() === uid);
    if (idx > -1) s.upvotes.splice(idx, 1);
    else          s.upvotes.push(req.user._id);

    await s.save();
    res.json({ upvoteCount: s.upvotes.length, hasUpvoted: idx === -1 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── POST /api/suggestions/:id/comment ────────────────────────────────────
router.post('/:id/comment', authenticateToken, async (req, res) => {
  try {
    const s = await Suggestion.findOne({ _id: req.params.id, isApproved: true });
    if (!s) return res.status(404).json({ message: 'Not found' });

    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ message: 'Comment text required' });

    s.comments.push({
      author:     req.user._id,
      authorName: `${req.user.firstName} ${req.user.lastName}`,
      text:       text.trim(),
    });
    await s.save();
    res.json({ comments: s.comments });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── DELETE /api/suggestions/:id/comment/:cid ─────────────────────────────
router.delete('/:id/comment/:cid', authenticateToken, async (req, res) => {
  try {
    const s = await Suggestion.findById(req.params.id);
    if (!s) return res.status(404).json({ message: 'Not found' });

    const comment = s.comments.id(req.params.cid);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });

    const isOwner = comment.author.toString() === req.user._id.toString();
    if (!isOwner && req.user.role !== 'admin')
      return res.status(403).json({ message: 'Forbidden' });

    comment.deleteOne();
    await s.save();
    res.json({ message: 'Comment deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── PUT /api/suggestions/:id/status — admin ───────────────────────────────
router.put('/:id/status', authenticateToken, authorize('admin'), async (req, res) => {
  try {
    const s = await Suggestion.findById(req.params.id);
    if (!s) return res.status(404).json({ message: 'Not found' });

    if (req.body.status    !== undefined) s.status     = req.body.status;
    if (req.body.isApproved !== undefined) s.isApproved = req.body.isApproved;

    await s.save();
    res.json({ suggestion: s });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── PUT /api/suggestions/:id/reply — admin ────────────────────────────────
router.put('/:id/reply', authenticateToken, authorize('admin'), async (req, res) => {
  try {
    const s = await Suggestion.findById(req.params.id);
    if (!s) return res.status(404).json({ message: 'Not found' });

    s.adminReply = { text: (req.body.text || '').trim(), updatedAt: new Date() };
    await s.save();
    res.json({ suggestion: s });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── PUT /api/suggestions/:id/pin — admin toggle ───────────────────────────
router.put('/:id/pin', authenticateToken, authorize('admin'), async (req, res) => {
  try {
    const s = await Suggestion.findById(req.params.id);
    if (!s) return res.status(404).json({ message: 'Not found' });

    s.isPinned = !s.isPinned;
    await s.save();
    res.json({ isPinned: s.isPinned });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
