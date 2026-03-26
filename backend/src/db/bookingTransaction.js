/**
 * bookingTransaction.js
 *
 * All booking mutations that touch slot status live here.
 * Every function runs inside an explicit transaction with SELECT FOR UPDATE
 * to prevent concurrent double-booking.
 *
 * Pattern:
 *   1. BEGIN
 *   2. SELECT ... FOR UPDATE  ← row lock, blocks concurrent writers
 *   3. Validate state
 *   4. UPDATE / INSERT
 *   5. COMMIT  (or ROLLBACK on any error)
 */

const { getClient } = require('../config/db');

/**
 * Book a slot for a user.
 *
 * Guards:
 *   - Slot must be 'available' (checked with FOR UPDATE lock)
 *   - User must not already have an active booking (partial unique index)
 *   - Creates a bookings row AND an interviews row (outcome = 'pending')
 *
 * @param {string} userId
 * @param {string} slotId
 * @returns {Promise<{booking: Object, interview: Object}>}
 */
async function bookSlot(userId, slotId) {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // ── Lock the slot row. If another transaction already locked it,
    //    this query blocks until that transaction commits or rolls back.
    const { rows: slotRows } = await client.query(
      `SELECT id, status, interviewer_id, slot_start
       FROM   slots
       WHERE  id = $1
       FOR UPDATE`,
      [slotId]
    );

    if (!slotRows.length) {
      throw Object.assign(new Error('Slot not found'), { code: 'SLOT_NOT_FOUND', status: 404 });
    }

    const slot = slotRows[0];

    if (slot.status !== 'available') {
      throw Object.assign(new Error('Slot is no longer available'), { code: 'SLOT_UNAVAILABLE', status: 409 });
    }

    // ── Enforce 24-hour advance booking rule
    const now           = new Date();
    const slotStartDate = new Date(slot.slot_start);
    const hoursUntilSlot = (slotStartDate - now) / (1000 * 60 * 60);

    if (hoursUntilSlot < 1) {
      throw Object.assign(new Error('Cannot book a slot less than 1 hour away'), { code: 'TOO_LATE', status: 400 });
    }

    // ── Mark slot as booked
    await client.query(
      `UPDATE slots SET status = 'booked' WHERE id = $1`,
      [slotId]
    );

    // ── Create booking row
    // The partial unique index on bookings(user_id) WHERE active
    // will throw a unique_violation if user already has an active booking.
    let bookingRow;
    try {
      const { rows } = await client.query(
        `INSERT INTO bookings (user_id, slot_id, status)
         VALUES ($1, $2, 'pending')
         RETURNING *`,
        [userId, slotId]
      );
      bookingRow = rows[0];
    } catch (err) {
      if (err.code === '23505') {
        // unique_violation from our partial index
        throw Object.assign(
          new Error('You already have an active booking'),
          { code: 'DUPLICATE_BOOKING', status: 409 }
        );
      }
      throw err;
    }

    // ── Create interview record (outcome starts as 'pending')
    const { rows: intRows } = await client.query(
      `INSERT INTO interviews (booking_id, user_id, interviewer_id, outcome)
       VALUES ($1, $2, $3, 'pending')
       RETURNING *`,
      [bookingRow.id, userId, slot.interviewer_id]
    );

    await client.query('COMMIT');

    return { booking: bookingRow, interview: intRows[0] };

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Cancel a booking. Re-opens the slot.
 *
 * Guards:
 *   - Booking must belong to the requesting user
 *   - Must be more than 24 hours before the slot
 *   - Status must be 'pending' (cannot cancel after interview done)
 *
 * @param {string} bookingId
 * @param {string} userId      requesting user (for ownership check)
 * @returns {Promise<Object>}  updated booking row
 */
async function cancelBooking(bookingId, userId) {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Lock booking + its slot together
    const { rows } = await client.query(
      `SELECT b.id, b.user_id, b.status, b.slot_id,
              s.slot_start, s.status AS slot_status
       FROM   bookings b
       JOIN   slots    s ON s.id = b.slot_id
       WHERE  b.id = $1
       FOR UPDATE`,
      [bookingId]
    );

    if (!rows.length) {
      throw Object.assign(new Error('Booking not found'), { code: 'NOT_FOUND', status: 404 });
    }

    const booking = rows[0];

    if (booking.user_id !== userId) {
      throw Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN', status: 403 });
    }

    if (booking.status !== 'pending') {
      throw Object.assign(
        new Error('Only pending bookings can be cancelled'),
        { code: 'INVALID_STATE', status: 400 }
      );
    }

    // ── 24-hour cancellation window
    const now            = new Date();
    const slotStart      = new Date(booking.slot_start);
    const hoursUntilSlot = (slotStart - now) / (1000 * 60 * 60);

    if (hoursUntilSlot < 24) {
      throw Object.assign(
        new Error('Cancellations must be made at least 24 hours before the interview'),
        { code: 'CANCELLATION_WINDOW_PASSED', status: 400 }
      );
    }

    // ── Cancel the booking
    const { rows: updated } = await client.query(
      `UPDATE bookings
       SET    status = 'cancelled', cancelled_at = NOW()
       WHERE  id = $1
       RETURNING *`,
      [bookingId]
    );

    // ── Re-open the slot
    await client.query(
      `UPDATE slots SET status = 'available' WHERE id = $1`,
      [booking.slot_id]
    );

    await client.query('COMMIT');
    return updated[0];

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Record an interview outcome (accept or reject).
 * Triggers the notification flow after commit.
 *
 * @param {string} interviewId
 * @param {string} interviewerId   must match interview.interviewer_id
 * @param {'accepted'|'rejected'} outcome
 * @param {string} [notes]         private interviewer notes
 * @returns {Promise<Object>}      updated interview row
 */
async function recordOutcome(interviewId, interviewerId, outcome, notes = null) {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT * FROM interviews WHERE id = $1 FOR UPDATE`,
      [interviewId]
    );

    if (!rows.length) {
      throw Object.assign(new Error('Interview not found'), { code: 'NOT_FOUND', status: 404 });
    }

    const interview = rows[0];

    if (interview.interviewer_id !== interviewerId) {
      throw Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN', status: 403 });
    }

    if (interview.outcome !== 'pending') {
      throw Object.assign(
        new Error('Outcome already recorded'),
        { code: 'ALREADY_DECIDED', status: 409 }
      );
    }

    if (!['accepted', 'rejected'].includes(outcome)) {
      throw Object.assign(new Error('Invalid outcome'), { code: 'INVALID_OUTCOME', status: 400 });
    }

    // ── Write outcome
    const { rows: updated } = await client.query(
      `UPDATE interviews
       SET    outcome    = $1::interview_outcome,
              notes      = $2,
              decided_at = NOW()
       WHERE  id         = $3
       RETURNING *`,
      [outcome, notes, interviewId]
    );

    // ── Move booking to 'confirmed'
    await client.query(
      `UPDATE bookings SET status = 'confirmed' WHERE id = $1`,
      [interview.booking_id]
    );

    await client.query('COMMIT');

    // Return the updated row — caller is responsible for WebSocket notification
    return updated[0];

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Reassign all bookings from a deactivated interviewer to a new one.
 * Called by admin when deleting an interviewer.
 *
 * @param {string} fromInterviewerId   deactivated interviewer
 * @param {string} adminId             for audit
 * @returns {Promise<number>}          count of reassigned bookings
 */
async function reassignBookings(fromInterviewerId, adminId) {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Mark all pending bookings as reassigned
    const { rows } = await client.query(
      `UPDATE bookings
       SET    status        = 'reassigned',
              reassigned_to = NULL
       WHERE  slot_id IN (
         SELECT id FROM slots WHERE interviewer_id = $1
       )
       AND    status = 'pending'
       RETURNING id`,
      [fromInterviewerId]
    );

    // Deactivate the interviewer
    await client.query(
      `UPDATE users SET is_active = FALSE WHERE id = $1`,
      [fromInterviewerId]
    );

    await client.query('COMMIT');
    return rows.length;

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { bookSlot, cancelBooking, recordOutcome, reassignBookings };
