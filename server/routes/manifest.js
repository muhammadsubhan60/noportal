const express = require('express');
const fs      = require('fs');
const { authenticateToken } = require('../middleware/auth');
const ManifestJob = require('../models/ManifestJob');
const Balance      = require('../models/Balance');

const router = express.Router();

// Manifest jobs are created from the bulk label wizard (POST /api/labels/bulk
// when the chosen vendor has vendorType 'manifest'). This router only covers
// the user-facing read/cancel/download side of the job's lifecycle.

// ── GET /api/manifest  — user's job history ──────────────────────────────
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { status, carrier, page = 1, limit = 20 } = req.query;
    const filter = { user: req.user._id };
    if (status)  filter.status  = status;
    if (carrier) filter.carrier = carrier;

    const skip  = (parseInt(page) - 1) * parseInt(limit);
    const total = await ManifestJob.countDocuments(filter);
    const jobs  = await ManifestJob.find(filter)
      .populate('vendor', 'name carrier')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select('-requestFile.path -resultFile.path -timeline');

    res.json({ jobs, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    console.error('Manifest list error:', err);
    res.status(500).json({ message: 'Server error fetching manifest jobs' });
  }
});

// ── GET /api/manifest/:id ────────────────────────────────────────────────
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const job = await ManifestJob.findOne({ _id: req.params.id, user: req.user._id })
      .populate('vendor', 'name carrier');

    if (!job) return res.status(404).json({ message: 'Job not found' });
    res.json({ job });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ── PATCH /api/manifest/:id/cancel  — user cancels their own job ─────────
// Allowed only while status is open (admin hasn't uploaded results yet).
// Balance is refunded in full.
router.patch('/:id/cancel', authenticateToken, async (req, res) => {
  try {
    const job = await ManifestJob.findOne({ _id: req.params.id, user: req.user._id });
    if (!job) return res.status(404).json({ message: 'Job not found' });

    if (job.status !== 'open') {
      return res.status(400).json({
        message: `Cannot cancel a job with status "${job.status}". Cancellation is only allowed before results are uploaded.`,
      });
    }

    // Refund balance if payment was deducted
    if (job.userBilling?.deducted && job.userBilling?.totalAmount > 0) {
      const balance = await Balance.getOrCreateBalance(req.user._id);
      await balance.addTransaction({
        type:        'topup',
        amount:      job.userBilling.totalAmount,
        description: `Refund — cancelled manifest job (${job.carrier}, ${job.userBilling.labelCount} labels)`,
        performedBy: req.user._id,
      });
    }

    job.status              = 'cancelled';
    job.cancelledAt         = new Date();
    job.cancelledBy         = 'user';
    job.cancellationReason  = req.body.reason || 'Cancelled by user';
    job.timeline.push({
      status:      'cancelled',
      note:        `Cancelled by user. $${(job.userBilling?.totalAmount ?? 0).toFixed(2)} refunded.`,
      performedBy: req.user._id,
    });
    await job.save();

    res.json({ message: 'Job cancelled and balance refunded', job: { _id: job._id, status: job.status } });
  } catch (err) {
    console.error('Cancel manifest job error:', err);
    res.status(500).json({ message: 'Server error cancelling job' });
  }
});

// ── GET /api/manifest/:id/download  — download completed result file ─────
router.get('/:id/download', authenticateToken, async (req, res) => {
  try {
    const job = await ManifestJob.findOne({ _id: req.params.id, user: req.user._id });
    if (!job) return res.status(404).json({ message: 'Job not found' });
    if (job.status !== 'completed') {
      return res.status(400).json({ message: 'Labels not ready yet' });
    }
    if (!job.resultFile?.path || !fs.existsSync(job.resultFile.path)) {
      return res.status(404).json({ message: 'Result file not found' });
    }

    res.download(job.resultFile.path, job.resultFile.originalName);
  } catch (err) {
    res.status(500).json({ message: 'Server error downloading file' });
  }
});

module.exports = router;
