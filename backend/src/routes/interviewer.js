/**
 * routes/interviewer.js
 *
 * POST   /interviewer/availability          — set a new availability range
 * GET    /interviewer/availability          — list own availability ranges
 * DELETE /interviewer/availability/:id      — delete range (blocked if booked slots exist)
 * GET    /interviewer/slots                 — view own slots with booking info
 * GET    /interviewer/interviews            — upcoming + completed interviews
 * GET    /interviewer/stats                 — availability hours (total / weekly / monthly)
 * POST   /interviewer/interviews/:id/decide — accept or reject a user
 */

const express = require('express');
const { query, getClient } = require('../config/db');
const { authenticate, requireRole, requirePasswordChanged } = require('../middleware/auth');
const { validate } = require('../middleware/errorHandler');
const { generateSlots, insertSlots, hasOverlap, hasBookedSlots } = require('../db/slotGenerator');
const { recordOutcome } = require('../db/bookingTransaction');

const router = express.Router();

// All interviewer routes: must be logged in, correct role, and password changed
router.use(authenticate, requireRole('interviewer', 'admin'), requirePasswordChanged);

// ─── Set availability ─────────────────────────────────────────────────────────

router.post('/availability',
  validate({ body: ['date', 'startTime', 'endTime'] }),
  async (req, res, next) => {
    const { date, startTime, endTime } = req.body;
    const interviewerId = req.user.id;

    try {
      const client = await getClient();

      try {
        await client.query('BEGIN');

        // Guard: no overlapping ranges
        const overlap = await hasOverlap(client, interviewerId, date, startTime, endTime);
        if (overlap) {
          await client.query('ROLLBACK');
          return res.status(409).json({ error: 'This range overlaps with an existing availability window' });
        }

        // Insert the availability range
        const { rows: avRows } = await client.query(
          `INSERT INTO availability (interviewer_id, date, start_time, end_time)
           VALUES ($1, $2, $3, $4)
           RETURNING *`,
          [interviewerId, date, startTime, endTime]
        );

        const availability = avRows[0];

        // Materialise into 30-min slots
        const slots       = generateSlots({
          availabilityId: availability.id,
          interviewerId,
          date,
          startTime,
          endTime,
        });

        const inserted = await insertSlots(client, slots);

        await client.query('COMMIT');

        res.status(201).json({
          availability,
          slots_created: inserted,
          message: `${inserted} slot(s) created`,
        });

      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }

    } catch (err) {
      // Bubble user-facing errors from generateSlots
      if (!err.status) err.status = 400;
      next(err);
    }
  }
);

// ─── List own availability ────────────────────────────────────────────────────

router.get('/availability', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT
         a.*,
         COUNT(s.id)                                       AS total_slots,
         COUNT(s.id) FILTER (WHERE s.status = 'available') AS available_slots,
         COUNT(s.id) FILTER (WHERE s.status = 'booked')    AS booked_slots
       FROM availability a
       LEFT JOIN slots s ON s.availability_id = a.id
       WHERE a.interviewer_id = $1
         AND a.is_deleted     = FALSE
       GROUP BY a.id
       ORDER BY a.date ASC, a.start_time ASC`,
      [req.user.id]
    );

    res.json({ availability: rows });
  } catch (err) {
    next(err);
  }
});

// ─── Delete availability range ────────────────────────────────────────────────

router.delete('/availability/:id', async (req, res, next) => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Ownership check
    const { rows } = await client.query(
      `SELECT id, interviewer_id FROM availability WHERE id = $1 AND is_deleted = FALSE`,
      [req.params.id]
    );

    if (!rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Availability range not found' });
    }

    if (rows[0].interviewer_id !== req.user.id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Block deletion if any slot in range is booked
    const booked = await hasBookedSlots(client, req.params.id);
    if (booked) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'Cannot delete: one or more slots in this range are already booked. Cancel the bookings first or contact admin.',
        code:  'HAS_BOOKED_SLOTS',
      });
    }

    // Safe to delete — soft-delete the range and hard-delete the unbooked slots
    await client.query(
      `UPDATE availability SET is_deleted = TRUE WHERE id = $1`,
      [req.params.id]
    );

    await client.query(
      `DELETE FROM slots WHERE availability_id = $1 AND status = 'available'`,
      [req.params.id]
    );

    await client.query('COMMIT');
    res.json({ message: 'Availability range removed' });

  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// ─── Upcoming + completed interviews ─────────────────────────────────────────

router.get('/interviews', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT
         i.id,
         i.outcome,
         i.decided_at,
         i.notes,
         -- User details
         u.name   AS user_name,
         u.email  AS user_email,
         u.age    AS user_age,
         u.gender AS user_gender,
         u.city   AS user_city,
         -- Slot
         s.slot_start,
         s.slot_end,
         b.status AS booking_status
       FROM interviews i
       JOIN users    u ON u.id  = i.user_id
       JOIN bookings b ON b.id  = i.booking_id
       JOIN slots    s ON s.id  = b.slot_id
       WHERE i.interviewer_id = $1
       ORDER BY s.slot_start ASC`,
      [req.user.id]
    );

    const now       = new Date();
    const upcoming  = rows.filter(r => new Date(r.slot_start) > now);
    const completed = rows.filter(r => new Date(r.slot_start) <= now);

    res.json({ upcoming, completed });
  } catch (err) {
    next(err);
  }
});

// ─── Availability stats ───────────────────────────────────────────────────────

router.get('/stats', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT
         -- Total unbooked hours remaining
         ROUND(COUNT(s.id) FILTER (WHERE s.status = 'available') * 0.5, 1)
           AS unbooked_hours_total,

         -- This week (Mon–Sun)
         ROUND(COUNT(s.id) FILTER (
           WHERE s.status = 'available'
             AND s.slot_start >= date_trunc('week', NOW())
             AND s.slot_start <  date_trunc('week', NOW()) + INTERVAL '7 days'
         ) * 0.5, 1) AS unbooked_hours_this_week,

         -- This month
         ROUND(COUNT(s.id) FILTER (
           WHERE s.status = 'available'
             AND s.slot_start >= date_trunc('month', NOW())
             AND s.slot_start <  date_trunc('month', NOW()) + INTERVAL '1 month'
         ) * 0.5, 1) AS unbooked_hours_this_month,

         -- Total interviews conducted
         COUNT(DISTINCT i.id) FILTER (WHERE i.outcome <> 'pending')
           AS interviews_completed,

         -- Acceptance rate
         ROUND(
           100.0 * COUNT(DISTINCT i.id) FILTER (WHERE i.outcome = 'accepted')
           / NULLIF(COUNT(DISTINCT i.id) FILTER (WHERE i.outcome <> 'pending'), 0)
         , 1) AS acceptance_rate_pct

       FROM slots s
       LEFT JOIN bookings   b ON b.slot_id    = s.id
       LEFT JOIN interviews i ON i.booking_id = b.id
       WHERE s.interviewer_id = $1`,
      [req.user.id]
    );

    res.json({ stats: rows[0] });
  } catch (err) {
    next(err);
  }
});

// ─── Record interview decision ────────────────────────────────────────────────

router.post('/interviews/:id/decide',
  validate({ body: ['outcome'] }),
  async (req, res, next) => {
    const { outcome, notes } = req.body;

    try {
      const interview = await recordOutcome(
        req.params.id,
        req.user.id,
        outcome,
        notes
      );

      // Emit WebSocket event to the specific user (caller handles socket)
      if (req.io) {
        req.io.to(interview.user_id).emit('interview:outcome', {
          interviewId: interview.id,
          outcome:     interview.outcome,
          message:     outcome === 'accepted'
            ? 'Your profile has been accepted into Wingmann.'
            : 'Your profile was not accepted at this time.',
        });
      }

      res.json({ interview, message: 'Decision recorded' });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
