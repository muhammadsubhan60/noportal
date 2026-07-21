const startTime = Date.now();
console.log('⏳ Starting Label Flow server…');

const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
const jwt        = require('jsonwebtoken');
const { createServer } = require('http');
const { Server }       = require('socket.io');
const mongoose   = require('mongoose');
const path       = require('path');
require('dotenv').config();

const authRoutes    = require('./routes/auth');
const userRoutes    = require('./routes/users');
const emailRoutes   = require('./routes/email');
const balanceRoutes = require('./routes/balance');
const rateRoutes    = require('./routes/rates');
const carrierRoutes        = require('./routes/carriers');
const labelRoutes          = require('./routes/labels');
const vendorRoutes         = require('./routes/vendors');
const accessRoutes         = require('./routes/access');
const manifestRoutes       = require('./routes/manifest');
const adminManifestRoutes  = require('./routes/adminManifest');
const vendorPortalRoutes     = require('./routes/vendorPortal');
const manifestVendorRoutes   = require('./routes/manifestVendors');
const announcementRoutes     = require('./routes/announcements');
const paymentLogRoutes       = require('./routes/paymentLogs');
const statsRoutes            = require('./routes/stats');
const financeRoutes            = require('./routes/finance');
const walletRoutes             = require('./routes/wallets');
const expenseCategoryRoutes    = require('./routes/expenseCategories');
const cashbookRoutes           = require('./routes/cashbook');
const equityPartnerRoutes      = require('./routes/equityPartners');
const financialDashboardRoutes = require('./routes/financialDashboard');
const shippershubAccountRoutes      = require('./routes/shippershubAccounts');
const leaderboardRoutes             = require('./routes/leaderboard');
const suggestionRoutes              = require('./routes/suggestions');
const errorLogRoutes                = require('./routes/errorLogs');

// ── Startup validation ────────────────────────────────────────
// Fail fast rather than running in a broken / insecure state.
if (!process.env.JWT_SECRET) {
  console.error('❌ FATAL: JWT_SECRET environment variable is not set. Refusing to start.');
  process.exit(1);
}
if (process.env.NODE_ENV === 'production' && !process.env.CLIENT_URL) {
  console.error('❌ FATAL: CLIENT_URL must be set in production. Refusing to start.');
  process.exit(1);
}

const app    = express();
const server = createServer(app);

// Trust reverse proxy (Railway, nginx) so express-rate-limit reads the
// real client IP from X-Forwarded-For instead of the proxy's address.
app.set('trust proxy', 1);

const allowedOrigins = process.env.CLIENT_URL
  ? [process.env.CLIENT_URL]
  : ['http://localhost:3000', 'http://localhost:3001'];

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST']
  }
});

// ── Security middleware ───────────────────────────────────────
const cspConnectSrc = ["'self'", ...allowedOrigins];
if (process.env.NODE_ENV === 'production') {
  cspConnectSrc.push('wss:');
}

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // 'unsafe-inline' required for landing.html inline scripts (rate ticker,
      // savings calc, iframe-nav intercept) and the Google Analytics dataLayer snippet.
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://www.googletagmanager.com",
      ],
      styleSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://fonts.googleapis.com",   // Google Fonts CSS
      ],
      imgSrc: [
        "'self'",
        'data:',
        'blob:',
        "https://www.google-analytics.com",
      ],
      fontSrc: [
        "'self'",
        'data:',
        "https://fonts.gstatic.com",       // Google Fonts files (woff2 etc.)
      ],
      connectSrc: [
        ...cspConnectSrc,
        "https://www.google-analytics.com",
        "https://analytics.google.com",
        "https://region1.analytics.google.com",
        "https://www.googletagmanager.com",
      ],
      objectSrc: ["'none'"],
      baseUri:   ["'self'"],
      frameAncestors: ["'self'"],
      upgradeInsecureRequests: [],
    },
  },
}));
app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));

// ── Rate limiting ─────────────────────────────────────────────
// Global limiter for all routes.
// Raised from 100 — with Command Center, User Stats, Bulk Access, etc. now
// firing several requests per page, normal navigation was tripping the old
// limit well within 15 minutes.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 400 : 1000,
  message: { message: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Stricter limiter for authentication endpoints (login, register, password reset)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 20 : 500,
  message: { message: 'Too many login attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Body parsing ──────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Attach socket.io to request ───────────────────────────────
app.use((req, res, next) => {
  req.io = io;
  next();
});

// ── Never cache API responses ──────────────────────────────────
// These are authenticated, per-user, frequently-changing JSON endpoints.
// Express generates an ETag for every response by default, which makes them
// conditionally-cacheable — a browser can revalidate with If-None-Match and
// get served a stale locally-cached body via a 304. Static assets (JS/CSS/
// images) are unaffected since this only applies under /api.
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

// ── Routes ────────────────────────────────────────────────────
// Auth routes get the stricter per-endpoint rate limiter
app.use('/api/auth',         authLimiter, authRoutes);
// Vendor portal login also gets the auth limiter
app.use('/api/vendor-portal', authLimiter, vendorPortalRoutes);

app.use('/api/users',    userRoutes);
app.use('/api/email',    emailRoutes);
app.use('/api/balance',  balanceRoutes);
app.use('/api/rates',    rateRoutes);
app.use('/api/carriers',       carrierRoutes);
app.use('/api/labels',         labelRoutes);
app.use('/api/vendors',        vendorRoutes);
app.use('/api/access',         accessRoutes);
app.use('/api/manifest',       manifestRoutes);
app.use('/api/admin/manifest', adminManifestRoutes);
app.use('/api/manifest-vendors', manifestVendorRoutes);
app.use('/api/announcements',   announcementRoutes);
app.use('/api/payment-logs',    paymentLogRoutes);
app.use('/api/stats',           statsRoutes);
app.use('/api/finance',               financeRoutes);
app.use('/api/wallets',               walletRoutes);
app.use('/api/expense-categories',    expenseCategoryRoutes);
app.use('/api/cashbook',              cashbookRoutes);
app.use('/api/equity-partners',       equityPartnerRoutes);
app.use('/api/financial-dashboard',   financialDashboardRoutes);
app.use('/api/shippershub-accounts',  shippershubAccountRoutes);
app.use('/api/leaderboard',           leaderboardRoutes);
app.use('/api/suggestions',           suggestionRoutes);
app.use('/api/error-logs',            errorLogRoutes);

// ── Health check ──────────────────────────────────────────────
// Returns minimal info only — no internal state exposed publicly
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ── Static files / 404 ───────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/build')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
  });
} else {
  app.use('*', (req, res) => {
    res.status(404).json({ message: 'Route not found' });
  });
}

// ── Global error handler ──────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    message: 'Something went wrong!',
    // Never expose stack traces or internal errors in production
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ── Socket.io — authenticated connections only ────────────────
//
// Each connecting client must supply its JWT in the handshake auth object:
//   io({ auth: { token: localStorage.getItem('token') } })
//
// The middleware verifies the token and attaches userId to the socket.
// The socket is then automatically joined to the user's own room — the
// client no longer needs to emit 'join-room', and cannot join anyone else's.

io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Authentication required'));

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Lazy-load User model to avoid circular dependency issues at startup
    const User = require('./models/User');
    const user = await User.findById(decoded.id).select('_id isActive role');
    if (!user || !user.isActive) return next(new Error('User not found or inactive'));
    socket.userId   = user._id.toString();
    socket.userRole = user.role;
    next();
  } catch {
    next(new Error('Invalid or expired token'));
  }
});

io.on('connection', (socket) => {
  // Auto-join the user's own private room — no client-controlled room joining
  socket.join(socket.userId);

  // Admins also join the shared admin-room for platform-wide real-time events
  if (socket.userRole === 'admin') {
    socket.join('admin-room');
  }

  socket.on('disconnect', () => {
    // No-op — socket.io cleans up room membership automatically
  });
});

// ── MongoDB + Server start ────────────────────────────────────
const PORT = parseInt(process.env.PORT || '5001', 10);

const connectDB = async () => {
  try {
    console.log('⏳ Connecting to MongoDB…');
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 8000,
    });
    console.log(`✅ MongoDB connected: ${conn.connection.host}`);
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  }
};

// Auto-seed ShippersHub account from .env if DB has none yet
async function seedShippersHubAccount() {
  try {
    const ShippersHubAccount = require('./models/ShippersHubAccount');
    const count = await ShippersHubAccount.countDocuments();
    if (count > 0) return;

    const email    = process.env.SHIPPERSHUB_EMAIL;
    const password = process.env.SHIPPERSHUB_PASSWORD;
    if (!email || !password) return;

    const account = new ShippersHubAccount({ name: 'Default Account', email, encryptedPassword: '', iv: '', isActive: true });
    account.setPassword(password);
    await account.save();
    console.log(`✅ ShippersHub default account seeded from .env (${email})`);
  } catch (err) {
    console.warn('⚠️  Could not seed ShippersHub account:', err.message);
  }
}

connectDB().then(async () => {
  await seedShippersHubAccount();

  server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT} (started in ${Date.now() - startTime}ms)`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });

  server.on('error', (err) => {
    // Let the process manager (PM2, Railway, Docker) handle port conflicts and restarts.
    // Do not use execSync/shell commands to kill processes — that's a security risk.
    console.error(`❌ Server error: ${err.message}`);
    process.exit(1);
  });
});
