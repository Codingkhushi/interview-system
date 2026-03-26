/**
 * routes/auth.js
 *
 * POST /auth/login           — interviewer/admin local login
 * GET  /auth/google          — redirect to Google consent
 * GET  /auth/google/callback — Google OAuth callback
 * GET  /auth/me              — return current user from token
 * POST /auth/change-password — interviewer first-login password change
 */

const express  = require('express');
const bcrypt   = require('bcryptjs');
const passport = require('passport');
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');

const { query }                   = require('../config/db');
const { signToken }               = require('../config/jwt');
const { authenticate, requireRole, requirePasswordChanged } = require('../middleware/auth');
const { validate }                = require('../middleware/errorHandler');

const router = express.Router();

// ─── Passport Google strategy (configured once, used per-request) ─────────────
passport.use(new GoogleStrategy(
  {
    clientID:     process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL:  process.env.GOOGLE_CALLBACK_URL,
  },
  async (_accessToken, _refreshToken, profile, done) => {
    const email    = profile.emails?.[0]?.value;
    const name     = profile.displayName;
    const googleId = profile.id;

    if (!email) return done(new Error('No email returned from Google'));

    try {
      // Prevent OAuth from hijacking an existing local (interviewer) account
      const { rows: existing } = await query(
        `SELECT id, auth_provider, is_active FROM users WHERE email = $1`,
        [email]
      );

      if (existing.length) {
        const user = existing[0];
        if (user.auth_provider !== 'google') {
          return done(null, false, { message: 'Email registered as interviewer account. Use password login.' });
        }
        if (!user.is_active) {
          return done(null, false, { message: 'Account deactivated.' });
        }
        // Existing Google user — just return them
        const { rows } = await query(
          `SELECT id, email, role, is_active, force_pw_change FROM users WHERE id = $1`,
          [user.id]
        );
        return done(null, rows[0]);
      }

      // New Google sign-up — create user row (profile not yet complete)
      const { rows } = await query(
        `INSERT INTO users (email, name, role, auth_provider, profile_complete)
         VALUES ($1, $2, 'user', 'google', FALSE)
         RETURNING id, email, role, is_active, force_pw_change`,
        [email, name]
      );

      return done(null, rows[0]);
    } catch (err) {
      return done(err);
    }
  }
));

// ─── Google OAuth ─────────────────────────────────────────────────────────────

router.get('/google',
  passport.authenticate('google', { scope: ['email', 'profile'], session: false })
);

router.get('/google/callback',
  passport.authenticate('google', { session: false, failWithError: true }),
  (req, res) => {
    const token = signToken(req.user);
    // Redirect to frontend with token in query param.
    // Frontend stores it in memory (not localStorage).
    const needsProfile = !req.user.profile_complete;
    res.redirect(`${process.env.CLIENT_URL}/auth/callback?token=${token}&needsProfile=${needsProfile}`);
  },
  // Passport failure handler
  (err, req, res, _next) => {
    const msg = err?.message || 'Google authentication failed';
    res.redirect(`${process.env.CLIENT_URL}/auth/error?message=${encodeURIComponent(msg)}`);
  }
);

// ─── Local login (interviewers + admins) ─────────────────────────────────────

router.post('/login',
  validate({ body: ['email', 'password'] }),
  async (req, res, next) => {
    const { email, password } = req.body;

    try {
      const { rows } = await query(
        `SELECT id, email, role, password_hash, is_active, force_pw_change, auth_provider
         FROM   users
         WHERE  email = $1`,
        [email.toLowerCase().trim()]
      );

      const user = rows[0];

      // Constant-time failure: always run bcrypt even on missing user
      const hashToCheck = user?.password_hash || '$2b$10$invalidhashpadding0000000000000000000000000000000000';
      const valid        = await bcrypt.compare(password, hashToCheck);

      if (!user || !valid) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      if (user.auth_provider !== 'local') {
        return res.status(401).json({ error: 'This account uses Google login' });
      }

      if (!user.is_active) {
        return res.status(401).json({ error: 'Account has been deactivated' });
      }

      const token = signToken(user);

      res.json({
        token,
        user: {
          id:              user.id,
          email:           user.email,
          role:            user.role,
          force_pw_change: user.force_pw_change,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── Current user ─────────────────────────────────────────────────────────────

router.get('/me', authenticate, (req, res) => {
  // req.user already loaded by authenticate middleware
  res.json({ user: req.user });
});

// ─── Force password change (interviewer first login) ─────────────────────────

router.post('/change-password',
  authenticate,
  requireRole('interviewer', 'admin'),
  validate({ body: ['currentPassword', 'newPassword'] }),
  async (req, res, next) => {
    const { currentPassword, newPassword } = req.body;

    if (newPassword.length < 8) {
      return res.status(422).json({ error: 'New password must be at least 8 characters' });
    }

    try {
      const { rows } = await query(
        `SELECT password_hash FROM users WHERE id = $1`,
        [req.user.id]
      );

      const valid = await bcrypt.compare(currentPassword, rows[0].password_hash);
      if (!valid) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }

      const newHash = await bcrypt.hash(newPassword, 12);

      await query(
        `UPDATE users
         SET    password_hash   = $1,
                force_pw_change = FALSE
         WHERE  id = $2`,
        [newHash, req.user.id]
      );

      res.json({ message: 'Password updated successfully' });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
