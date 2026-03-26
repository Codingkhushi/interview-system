/**
 * slotGenerator.js
 * Converts an availability range into discrete 30-min slot rows.
 * Pure functions only — no DB calls except insertSlots() and helpers.
 */

/**
 * Generate slot objects from an availability range.
 * @param {Object} params
 * @param {string} params.availabilityId
 * @param {string} params.interviewerId
 * @param {string} params.date         'YYYY-MM-DD'
 * @param {string} params.startTime    'HH:MM' 24h
 * @param {string} params.endTime      'HH:MM' 24h
 * @param {string} [params.timezone]   IANA tz, default 'Asia/Kolkata'
 * @param {number} [params.slotMinutes] default 30
 * @returns {Array}
 */
function generateSlots({ availabilityId, interviewerId, date, startTime, endTime, timezone = 'Asia/Kolkata', slotMinutes = 30 }) {
  const parseLocal = (dateStr, timeStr, tz) => {
    const [year, month, day] = dateStr.split('-').map(Number);
    const [hour, minute]     = timeStr.split(':').map(Number);
    const candidate = new Date(Date.UTC(year, month - 1, day, hour, minute));
    const localParts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(candidate);
    const get  = (type) => parseInt(localParts.find(p => p.type === type).value);
    const tzH  = get('hour') === 24 ? 0 : get('hour');
    const diff = (hour * 60 + minute - (tzH * 60 + get('minute'))) * 60 * 1000;
    return new Date(candidate.getTime() + diff);
  };

  const start      = parseLocal(date, startTime, timezone);
  const end        = parseLocal(date, endTime,   timezone);
  const durationMs = slotMinutes * 60 * 1000;

  if (end <= start) throw new Error(`endTime must be after startTime`);

  const slots   = [];
  let   current = start;

  while (current.getTime() + durationMs <= end.getTime()) {
    const slotEnd = new Date(current.getTime() + durationMs);
    slots.push({
      availability_id: availabilityId,
      interviewer_id:  interviewerId,
      slot_start:      current.toISOString(),
      slot_end:        slotEnd.toISOString(),
      status:          'available',
    });
    current = slotEnd;
  }

  if (slots.length === 0) throw new Error(`Range too short for a ${slotMinutes}-min slot`);
  return slots;
}

/**
 * Bulk-insert slots in an existing transaction client.
 * @param {Object} client  pg PoolClient
 * @param {Array}  slots   output of generateSlots()
 * @returns {Promise<number>} inserted count
 */
async function insertSlots(client, slots) {
  if (!slots.length) return 0;

  const values = [];
  const params = [];
  let   i      = 1;

  for (const s of slots) {
    values.push(`($${i++}, $${i++}, $${i++}, $${i++}, $${i++}::slot_status)`);
    params.push(s.availability_id, s.interviewer_id, s.slot_start, s.slot_end, s.status);
  }

  const sql = `
    INSERT INTO slots (availability_id, interviewer_id, slot_start, slot_end, status)
    VALUES ${values.join(', ')}
    ON CONFLICT (interviewer_id, slot_start) DO NOTHING
    RETURNING id
  `;

  const { rows } = await client.query(sql, params);
  return rows.length;
}

/**
 * Returns true if the proposed range overlaps an existing availability row.
 */
async function hasOverlap(client, interviewerId, date, startTime, endTime) {
  const { rows } = await client.query(
    `SELECT id FROM availability
     WHERE interviewer_id = $1
       AND date           = $2
       AND is_deleted     = FALSE
       AND start_time     < $4::time
       AND end_time       > $3::time`,
    [interviewerId, date, startTime, endTime]
  );
  return rows.length > 0;
}

/**
 * Returns true if any slot in the given availability range is already booked.
 * Used to block deletion of an availability row.
 */
async function hasBookedSlots(client, availabilityId) {
  const { rows } = await client.query(
    `SELECT id FROM slots
     WHERE availability_id = $1
       AND status          = 'booked'
     LIMIT 1`,
    [availabilityId]
  );
  return rows.length > 0;
}

module.exports = { generateSlots, insertSlots, hasOverlap, hasBookedSlots };
