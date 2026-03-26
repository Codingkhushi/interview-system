/**
 * src/index.js
 * Express app + Socket.io server
 */

require('dotenv').config();

const express    = require('express');
const http       = require('http');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
const passport   = require('passport');
const { Server } = require('socket.io');

const { verifyToken }    = require('./config/jwt');
const { errorHandler }   = require('./middleware/errorHandler');

const authRouter         = require('./routes/auth');
const userRouter         = require('./routes/user');
const interviewerRouter  = require('./routes/interviewer');
const adminRouter        = require('./routes/admin');

const app    = express();
const server = http.createServer(app);

// ─── Socket.io setup ──────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: { origin: process.env.CLIENT_URL, credentials: true },
});

// Authenticate socket connections via JWT
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Missing token'));

  try {
    const payload = verifyToken(token);
    socket.userId = payload.sub;
    next();
  } catch {
    next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  // Each user joins a room named after their own userId.
  // When the interviewer records an outcome, we emit to that room.
  socket.join(socket.userId);

  socket.on('disconnect', () => {
    socket.leave(socket.userId);
  });
});

// ─── Express middleware ───────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json());
app.use(passport.initialize());

// Rate limit all API routes (generous for development)
app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max:      300,
  standardHeaders: true,
  legacyHeaders:   false,
}));

// Stricter limit on auth endpoints
app.use('/api/auth/login', rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      10,
  message:  { error: 'Too many login attempts. Try again in 15 minutes.' },
}));

// Attach io to every request so route handlers can emit events
app.use((req, _res, next) => {
  req.io = io;
  next();
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth',        authRouter);
app.use('/api/user',        userRouter);
app.use('/api/interviewer', interviewerRouter);
app.use('/api/admin',       adminRouter);

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

// ─── Central error handler (must be last) ────────────────────────────────────
app.use(errorHandler);

// ─── Start ────────────────────────────────────────────────────────────────────
if (require.main === module) {
  const PORT = process.env.PORT || 4000;
  server.listen(PORT, () => {
    console.log(`\n🚀  Wingmann IMS backend running on http://localhost:${PORT}`);
    console.log(`    Run "npm run db:migrate" to apply pending migrations.\n`);
  });
}

module.exports = { app, server, io };
