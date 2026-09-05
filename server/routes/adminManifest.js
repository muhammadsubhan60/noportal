const express = require('express');
const path    = require('path');
const fs      = require('fs');
const multer  = require('multer');
const { authenticateToken, authorize } = require('../middleware/auth');
const ManifestJob = require('../models/ManifestJob');

const router = express.Router();

// All routes require admin
router.use(authenticateToken, authorize('admin'));

// ── Result file storage ───────────────────────────────────────────────────
const resultDir = path.join(__dirname, '../uploads/manifests/results');
fs.mkdirSync(resultDir, { recursive: true });

const resultStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, resultDir),
  filename:    (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext    = path.extname(file.originalname).toLowerCase();
    cb(null, `result-${unique}${ext}`);
  },
});

/**
 * Validate the actual content of an uploaded file by reading its magic bytes.
 * Extension spoofing (e.g. malware.exe renamed to malware.pdf) is rejected here.
 */
function validateMagicBytes(filePath, extension) {
  try {
    const buf = Buffer.alloc(8);
    const fd  = fs.openSync(filePath, 'r');
    fs.readSync(fd, buf, 0, 8, 0);
    fs.closeSync(fd);

    if (extension === '.pdf') {
      return buf.slice(0, 4).toString('ascii') === '%PDF';
    }
    if (extension === '.zip') {
      return buf[0] === 0x50 && buf[1] === 0x4B;
    }
    if (extension === '.csv') {
      return !buf.includes(0x00);
    }
    return false;
  } catch {
    return false;
  }
}

const uploadResult = multer({
  storage: resultStorage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.zip', '.pdf', '.csv'].includes(ext)) cb(null, true);
    else cb(new Error('Only ZIP, PDF, or CSV files are allowed'));
  },
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
});

// ── GET /api/admin/manifest/stats ────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const [total, open, completed, cancelled] = await Promise.all([
      ManifestJob.countDocuments(),
      ManifestJob.countDocuments({ status: 'open' }),
      ManifestJob.countDocuments({ status: 'completed' }),
      ManifestJob.countDocuments({ status: 'cancelled' }),
    ]);
    res.json({ total, open, completed, cancelled });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ── GET /api/admin/manifest  — all jobs with filters ────────────────────
router.get('/', async (req, res) => {
  try {
    const { status, carrier, userId, page = 1, limit = 30 } = req.query;
    const filter = {};
    if (status)   filter.status = status;
    if (carrier)  filter.carrier = carrier;
    if (userId)   filter.user = userId;

    const skip  = (parseInt(page) - 1) * parseInt(limit);
    const total = await ManifestJob.countDocuments(filter);
    const jobs  = await ManifestJob.find(filter)
      .populate('user',   'firstName lastName email')
      .populate('vendor', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select('-requestFile.path -resultFile.path');

    res.json({ jobs, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── GET /api/admin/manifest/:id ──────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const job = await ManifestJob.findById(req.params.id)
      .populate('user',   'firstName lastName email')
      .populate('vendor', 'name')
      .populate('timeline.performedBy', 'firstName lastName');
    if (!job) return res.status(404).json({ message: 'Job not found' });
    res.json({ job });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ── POST /api/admin/manifest/:id/upload-result  — upload the finished labels ─
// Uploading immediately completes the job — admin does the fulfillment work
// directly, so there is no separate accept/review step.
router.post('/:id/upload-result', uploadResult.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Result file is required' });

    const ext = path.extname(req.file.originalname).toLowerCase();
    if (!validateMagicBytes(req.file.path, ext)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ message: 'File content does not match its declared type' });
    }

    const job = await ManifestJob.findById(req.params.id)
      .populate('user', 'firstName lastName email');
    if (!job) {
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ message: 'Job not found' });
    }
    if (job.status === 'cancelled') {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ message: 'Cannot upload a result for a cancelled job' });
    }

    // Remove the previous result file if this is a correction re-upload
    if (job.resultFile?.path && fs.existsSync(job.resultFile.path)) {
      fs.unlinkSync(job.resultFile.path);
    }

    const wasAlreadyCompleted = job.status === 'completed';

    job.resultFile = {
      originalName: req.file.originalname,
      storedName:   req.file.filename,
      path:         req.file.path,
      uploadedAt:   new Date(),
    };
    job.status      = 'completed';
    job.completedAt = new Date();
    job.timeline.push({
      status:      'completed',
      note:        wasAlreadyCompleted ? 'Result file replaced by admin.' : 'Result file uploaded by admin. Job completed.',
      performedBy: req.user._id,
    });
    await job.save();

    // Notify user via email (skip on a silent correction re-upload)
    if (!wasAlreadyCompleted) {
      try {
        const { sendResendEmail, userLabelsReady } = require('../services/emailService');
        const user = job.user;
        if (user?.email) {
          const downloadUrl = `${process.env.CLIENT_URL || 'http://localhost:3000'}/manifest/history`;
          const tpl = userLabelsReady(user.firstName, job._id.toString(), job.carrier, job.requestFile.labelCount, downloadUrl);
          await sendResendEmail({ to: user.email, ...tpl });
        }
      } catch (_) {}

      if (req.io) {
        req.io.to(job.user._id?.toString() || job.user.toString()).emit('manifest-completed', {
          jobId: job._id, carrier: job.carrier,
        });
      }
    }

    res.json({ message: wasAlreadyCompleted ? 'Result file replaced.' : 'Result uploaded. Job completed and user notified.', job });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    console.error('Admin manifest upload error:', err);
    res.status(500).json({ message: 'Server error uploading result' });
  }
});

// ── PUT /api/admin/manifest/:id/cancel ───────────────────────────────────
router.put('/:id/cancel', async (req, res) => {
  try {
    const { reason } = req.body;
    const job = await ManifestJob.findById(req.params.id);
    if (!job) return res.status(404).json({ message: 'Job not found' });

    if (['completed', 'cancelled'].includes(job.status)) {
      return res.status(400).json({ message: `Cannot cancel a job with status "${job.status}"` });
    }

    job.status             = 'cancelled';
    job.cancelledAt        = new Date();
    job.cancelledBy        = 'admin';
    job.cancellationReason = reason || '';
    job.timeline.push({
      status:      'cancelled',
      note:        `Cancelled by admin. Reason: ${reason || 'N/A'}`,
      performedBy: req.user._id,
    });
    await job.save();

    if (req.io) req.io.to(job.user.toString()).emit('manifest-cancelled', { jobId: job._id });

    res.json({ message: 'Job cancelled', job });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ── GET /api/admin/manifest/:id/download-request  — download user CSV ────
router.get('/:id/download-request', async (req, res) => {
  try {
    const job = await ManifestJob.findById(req.params.id);
    if (!job) return res.status(404).json({ message: 'Job not found' });
    if (!job.requestFile?.path || !fs.existsSync(job.requestFile.path)) {
      return res.status(404).json({ message: 'Request file not found' });
    }
    res.download(job.requestFile.path, job.requestFile.originalName);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ── GET /api/admin/manifest/:id/download-result  — download uploaded result ──
router.get('/:id/download-result', async (req, res) => {
  try {
    const job = await ManifestJob.findById(req.params.id);
    if (!job) return res.status(404).json({ message: 'Job not found' });
    if (!job.resultFile?.path || !fs.existsSync(job.resultFile.path)) {
      return res.status(404).json({ message: 'Result file not found' });
    }
    res.download(job.resultFile.path, job.resultFile.originalName);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
