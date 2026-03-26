/**
 * routes/user.js
 *
 * POST /user/profile             — complete profile after Google sign-up
 * GET  /user/slots               — browse available slots
 * POST /user/bookings            — book a slot
 * GET  /user/booking             — get own active booking + interview status
 * DELETE /user/bookings/:id      — cancel a booking (24h window)
 */

const express = require('express');
const { query } = require('../config/db');
const { authenticate, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/errorHandler');
const { bookSlot, cancelBooking } = require('../db/bookingTransaction');

const router = express.Router();

router.use(authenticate, requireRole('user'));

// ─── Complete profile ─────────────────────────────────────────────────────────

router.post('/profile',
  validate({ body: ['name', 'age', 'gender', 'city'] }),
  async (req, res, next) => {
    const { name, age, gender, city } = req.body;

    if (age < 18 || age > 120) {
      return res.status(422).json({ error: 'Age must be between 18 and 120' });
    }

    try {
      const { rows } = await query(
        `UPDATE users
         SET    name             = $1,
                age              = $2,
                gender           = $3,
                city             = $4,
                profile_complete = TRUE
         WHERE  id = $5
         RETURNING id, name, age, gender, city, profile_complete`,
        [name, age, gender, city, req.user.id]
      );

      res.json({ user: rows[0] });
    } catch (err) {
      next(err);
    }
  }
);

// ─── Browse available slots ───────────────────────────────────────────────────
// Returns slots grouped by date so the frontend can render a calendar view.
// Query params: ?from=YYYY-MM-DD&to=YYYY-MM-DD  (default: today + 14 days)

router.get('/slots', async (req, res, next) => {
  try {
    const from = req.query.from || new Date().toISOString().slice(0, 10);
    const to   = req.query.to   || new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

    const { rows } = await query(
      `SELECT
         s.id,
         s.slot_start,
         s.slot_end,
         s.status,
         u.id    AS interviewer_id,
         u.name  AS interviewer_name,
         u.gender AS interviewer_gender
       FROM   slots s
       JOIN   users u ON u.id = s.interviewer_id
       WHERE  s.status     = 'available'
         AND  s.slot_start >= $1::date
         AND  s.slot_start <  ($2::date + INTERVAL '1 day')
         AND  u.is_active  = TRUE
       ORDER BY s.slot_start ASC`,
      [from, to]
    );

    // Group by date for calendar rendering
    const byDate = {};
    for (const slot of rows) {
      const date = new Date(slot.slot_start).toISOString().slice(0, 10);
      if (!byDate[date]) byDate[date] = [];
      byDate[date].push(slot);
    }

    res.json({ slots: byDate });
  } catch (err) {
    next(err);
  }
});

// ─── Book a slot ──────────────────────────────────────────────────────────────

router.post('/bookings',
  validate({ body: ['slotId'] }),
  async (req, res, next) => {
    try {
      const result = await bookSlot(req.user.id, req.body.slotId);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }
);

// ─── Get own booking + interview status (user dashboard) ─────────────────────

router.get('/booking', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT
         b.id              AS booking_id,
         b.status          AS booking_status,
         b.booked_at,
         b.cancelled_at,
         -- Slot details
         s.slot_start,
         s.slot_end,
         -- Interviewer name only (not email)
         u.name            AS interviewer_name,
         u.gender          AS interviewer_gender,
         -- Interview outcome
         i.id              AS interview_id,
         i.outcome,
         i.decided_at
       FROM   bookings    b
       JOIN   slots       s  ON s.id  = b.slot_id
       JOIN   users       u  ON u.id  = s.interviewer_id
       LEFT JOIN interviews i ON i.booking_id = b.id
       WHERE  b.user_id = $1
         AND  b.status  IN ('pending', 'confirmed', 'reassigned')
       LIMIT 1`,
      [req.user.id]
    );

    if (!rows.length) {
      return res.json({ booking: null });
    }

    const row     = rows[0];
    // Map outcome to the display message shown in spec
    const message = {
      pending:  null,
      accepted: 'Your profile has been accepted into Wingmann.',
      rejected: 'Your profile was not accepted at this time.',
    }[row.outcome] ?? null;

    res.json({
      booking: {
        ...row,
        outcome_message: message,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── Cancel booking ───────────────────────────────────────────────────────────

router.delete('/bookings/:id', async (req, res, next) => {
  try {
    const booking = await cancelBooking(req.params.id, req.user.id);
    res.json({ booking, message: 'Booking cancelled successfully' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
