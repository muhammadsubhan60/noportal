const express = require('express');
const crypto  = require('crypto');
const { body, validationResult } = require('express-validator');
const User           = require('../models/User');
const Balance        = require('../models/Balance');
const Rate           = require('../models/Rate');
const { generateToken, authenticateToken } = require('../middleware/auth');
const { sendMail }   = require('../services/mailer');
const { validatePassword } = require('../utils/passwordPolicy');

const router = express.Router();

// ── POST /api/auth/register ───────────────────────────────────
router.post('/register', [
  body('firstName').trim().notEmpty().withMessage('First name is required'),
  body('lastName').trim().notEmpty().withMessage('Last name is required'),
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
  body('password').custom(value => {
    const err = validatePassword(value);
    if (err) throw new Error(err);
    return true;
  }),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
    }

    const { firstName, lastName, email, password } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }

    // Public registration always creates role:'user'.
    // Admins/resellers are created only via POST /api/users (requires admin token).
    const user = await User.create({ firstName, lastName, email, password, role: 'user' });

    await Balance.create({ user: user._id, currentBalance: 0, transactions: [] });
    await Rate.create({ user: user._id, labelRate: 1.00, setBy: user._id, notes: 'Default rate' });

    const token = generateToken(user._id);

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        fullName: user.fullName
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

// ── POST /api/auth/login ──────────────────────────────────────
router.post('/login', [
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
  body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
    }

    const { email, password } = req.body;

    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (!user.isActive) {
      return res.status(401).json({ message: 'Account is deactivated. Please contact admin.' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    user.lastLogin = new Date();
    await user.save();

    const token = generateToken(user._id);

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        fullName: user.fullName,
        lastLogin: user.lastLogin
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// ── GET /api/auth/me ──────────────────────────────────────────
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        fullName: user.fullName,
        lastLogin: user.lastLogin,
        isActive: user.isActive,
        createdAt: user.createdAt,
        clients: user.clients || []
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Server error getting user info' });
  }
});

// ── POST /api/auth/forgot-password ───────────────────────────
router.post('/forgot-password', [
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email')
], async (req, res) => {
  // Always return the same message to prevent account enumeration
  const SAFE_RESPONSE = { message: 'If an account with that email exists, a password reset link has been sent.' };

  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
    }

    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.json(SAFE_RESPONSE);
    }

    // Generate reset token — store only the hashed version
    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken  = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 minutes
    await user.save();

    // Send reset email — never log the raw token
    const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${resetToken}`;
    try {
      await sendMail({
        to:      user.email,
        subject: 'Password Reset Request — Label Flow',
        html: `
          <p>You requested a password reset for your Label Flow account.</p>
          <p><a href="${resetUrl}">Click here to reset your password</a></p>
          <p>This link expires in <strong>10 minutes</strong>.</p>
          <p>If you did not request this, ignore this email — your password will not change.</p>
        `,
      });
    } catch (mailErr) {
      // Email failure should not expose which accounts exist
      console.error('Password reset email failed to send:', mailErr.message);
      // Clear the token so the user can try again
      user.resetPasswordToken  = undefined;
      user.resetPasswordExpire = undefined;
      await user.save();
      return res.status(500).json({ message: 'Failed to send reset email. Please try again later.' });
    }

    res.json(SAFE_RESPONSE);
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: 'Server error during password reset' });
  }
});

// ── POST /api/auth/reset-password ────────────────────────────
router.post('/reset-password', [
  body('token').notEmpty().withMessage('Reset token is required'),
  body('password').custom(value => {
    const err = validatePassword(value);
    if (err) throw new Error(err);
    return true;
  }),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
    }

    const { token, password } = req.body;

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      resetPasswordToken:  hashedToken,
      resetPasswordExpire: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired reset token' });
    }

    user.password            = password;
    user.resetPasswordToken  = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    res.json({ message: 'Password reset successful. Please login with your new password.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Server error during password reset' });
  }
});

// ── POST /api/auth/logout ─────────────────────────────────────
router.post('/logout', authenticateToken, (req, res) => {
  // JWT is stateless — client removes token from storage.
  // For full revocation, implement a Redis-backed token blocklist.
  res.json({ message: 'Logout successful' });
});

module.exports = router;
