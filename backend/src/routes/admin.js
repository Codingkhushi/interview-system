/**
 * routes/admin.js
 *
 * All routes require: authenticate + requireRole('admin')
 *
 * POST   /admin/interviewers          — create interviewer + email credentials
 * GET    /admin/interviewers          — list all interviewers with availability hours
 * DELETE /admin/interviewers/:id      — soft-delete + reassign bookings
 * POST   /admin/interviewers/:id/resend-credentials — resend auto-gen password
 * GET    /admin/interviews            — all scheduled interviews
 * POST   /admin/bookings/:id/reassign — assign a reassigned booking to a new interviewer
 */

const express    = require('express');
const bcrypt     = require('bcryptjs');
const crypto     = require('crypto');
const nodemailer = require('nodemailer');

const { query }                        = require('../config/db');
const { authenticate, requireRole }    = require('../middleware/auth');
const { validate }                     = require('../middleware/errorHandler');
const { reassignBookings }             = require('../db/bookingTransaction');

const router = express.Router();

// All admin routes require admin role
router.use(authenticate, requireRole('admin'));

// ─── Email transport (shared) ─────────────────────────────────────────────────
function getTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

async function sendCredentials(email, name, password) {
  const transport = getTransport();
  await transport.sendMail({
    from:    process.env.EMAIL_FROM,
    to:      email,
    subject: 'Your Wingmann Interviewer Account',
    html: `
      <p>Hi ${name},</p>
      <p>Your Wingmann interviewer account has been created.</p>
      <p><strong>Login URL:</strong> ${process.env.CLIENT_URL}/interviewer/login<br>
         <strong>Email:</strong> ${email}<br>
         <strong>Password:</strong> <code>${password}</code></p>
      <p>You will be asked to change your password on first login.</p>
      <p>— The Wingmann Team</p>
    `,
  });
}

// ─── Create interviewer ───────────────────────────────────────────────────────

router.post('/interviewers',
  validate({ body: ['name', 'email', 'age', 'gender'] }),
  async (req, res, next) => {
    const { name, email, age, gender } = req.body;

    try {
      // Check for email collision (e.g. same email used to sign up as a user via Google)
      const { rows: existing } = await query(
        `SELECT id FROM users WHERE email = $1`,
        [email.toLowerCase().trim()]
      );
      if (existing.length) {
        return res.status(409).json({ error: 'An account with this email already exists' });
      }

      // Generate a secure random password (never stored in plaintext)
      const rawPassword = crypto.randomBytes(12).toString('base64url');
      const hash        = await bcrypt.hash(rawPassword, 12);

      const { rows } = await query(
        `INSERT INTO users
           (name, email, age, gender, role, auth_provider, password_hash, force_pw_change, created_by)
         VALUES ($1, $2, $3, $4, 'interviewer', 'local', $5, TRUE, $6)
         RETURNING id, name, email, role, created_at`,
        [name, email.toLowerCase().trim(), age, gender, hash, req.user.id]
      );

      // Fire-and-forget email (don't fail the request if email fails)
      sendCredentials(email, name, rawPassword).catch(err =>
        console.error('Failed to send credentials email:', err.message)
      );

      res.status(201).json({ interviewer: rows[0], message: 'Interviewer created. Credentials sent via email.' });
    } catch (err) {
      next(err);
    }
  }
);

// ─── List interviewers ────────────────────────────────────────────────────────

router.get('/interviewers', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT
         u.id,
         u.name,
         u.email,
         u.age,
         u.gender,
         u.is_active,
         u.created_at,
         -- Total availability hours set (all time)
         COALESCE(
           ROUND(
             SUM(EXTRACT(EPOCH FROM (a.end_time::time - a.start_time::time)) / 3600.0)
             FILTER (WHERE a.id IS NOT NULL AND a.is_deleted = FALSE)
           , 1),
           0
         ) AS total_availability_hours,
         -- Remaining unbooked hours
         COALESCE(
           COUNT(s.id) FILTER (WHERE s.status = 'available') * 0.5,
           0
         ) AS unbooked_hours,
         -- Interviews conducted
         COUNT(DISTINCT i.id) FILTER (WHERE i.outcome <> 'pending') AS interviews_completed
       FROM users u
       LEFT JOIN availability a  ON a.interviewer_id = u.id
       LEFT JOIN slots        s  ON s.interviewer_id = u.id
       LEFT JOIN interviews   i  ON i.interviewer_id = u.id
       WHERE u.role = 'interviewer'
       GROUP BY u.id
       ORDER BY u.created_at DESC`
    );

    res.json({ interviewers: rows });
  } catch (err) {
    next(err);
  }
});

// ─── Soft-delete interviewer ──────────────────────────────────────────────────

router.delete('/interviewers/:id', async (req, res, next) => {
  const { id } = req.params;

  try {
    const { rows } = await query(
      `SELECT id, role FROM users WHERE id = $1`,
      [id]
    );

    if (!rows.length || rows[0].role !== 'interviewer') {
      return res.status(404).json({ error: 'Interviewer not found' });
    }

    // Soft-delete + mark their pending bookings as reassigned
    const reassigned = await reassignBookings(id, req.user.id);

    res.json({
      message:          `Interviewer deactivated. ${reassigned} booking(s) marked for reassignment.`,
      reassigned_count: reassigned,
    });
  } catch (err) {
    next(err);
  }
});

// ─── Resend credentials ───────────────────────────────────────────────────────

router.post('/interviewers/:id/resend-credentials', async (req, res, next) => {
  const { id } = req.params;

  try {
    const { rows } = await query(
      `SELECT name, email FROM users WHERE id = $1 AND role = 'interviewer' AND is_active = TRUE`,
      [id]
    );

    if (!rows.length) return res.status(404).json({ error: 'Active interviewer not found' });

    const { name, email } = rows[0];
    const rawPassword     = crypto.randomBytes(12).toString('base64url');
    const hash            = await bcrypt.hash(rawPassword, 12);

    await query(
      `UPDATE users SET password_hash = $1, force_pw_change = TRUE WHERE id = $2`,
      [hash, id]
    );

    await sendCredentials(email, name, rawPassword);

    res.json({ message: 'New credentials sent successfully' });
  } catch (err) {
    next(err);
  }
});

// ─── All interviews (monitoring) ──────────────────────────────────────────────

router.get('/interviews', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT
         i.id,
         i.outcome,
         i.decided_at,
         i.created_at,
         -- User details
         u.name      AS user_name,
         u.email     AS user_email,
         u.city      AS user_city,
         u.gender    AS user_gender,
         u.age       AS user_age,
         -- Interviewer details
         iv.name     AS interviewer_name,
         iv.email    AS interviewer_email,
         -- Slot details
         s.slot_start,
         s.slot_end,
         -- Booking status
         b.status    AS booking_status
       FROM interviews  i
       JOIN users       u   ON u.id  = i.user_id
       JOIN users       iv  ON iv.id = i.interviewer_id
       JOIN bookings    b   ON b.id  = i.booking_id
       JOIN slots       s   ON s.id  = b.slot_id
       ORDER BY s.slot_start DESC`
    );

    res.json({ interviews: rows });
  } catch (err) {
    next(err);
  }
});

// ─── Reassign a booking to a new interviewer ──────────────────────────────────

router.post('/bookings/:id/reassign',
  validate({ body: ['newInterviewerId'] }),
  async (req, res, next) => {
    const { id }               = req.params;
    const { newInterviewerId } = req.body;

    try {
      // Verify new interviewer exists and is active
      const { rows: ivRows } = await query(
        `SELECT id FROM users WHERE id = $1 AND role = 'interviewer' AND is_active = TRUE`,
        [newInterviewerId]
      );
      if (!ivRows.length) {
        return res.status(404).json({ error: 'New interviewer not found or inactive' });
      }

      const { rows } = await query(
        `UPDATE bookings
         SET    reassigned_to = $1,
                status        = 'pending'
         WHERE  id = $2 AND status = 'reassigned'
         RETURNING *`,
        [newInterviewerId, id]
      );

      if (!rows.length) {
        return res.status(404).json({ error: 'Booking not found or not in reassigned state' });
      }

      // Also update the interview record's interviewer
      await query(
        `UPDATE interviews SET interviewer_id = $1 WHERE booking_id = $2`,
        [newInterviewerId, id]
      );

      res.json({ booking: rows[0], message: 'Booking reassigned successfully' });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
