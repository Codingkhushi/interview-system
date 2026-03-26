-- Migration 005: Bookings
-- One booking = one user claiming one slot.
-- The partial unique index enforces one-active-booking-per-user at the DB level.

CREATE TABLE bookings (
  id            UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),

  user_id       UUID            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slot_id       UUID            NOT NULL REFERENCES slots(id) ON DELETE RESTRICT,
                                -- RESTRICT: cannot delete a slot that has a booking

  status        booking_status  NOT NULL DEFAULT 'pending',

  -- Populated by admin when original interviewer is deactivated
  reassigned_to UUID            REFERENCES users(id) ON DELETE SET NULL,

  -- Timestamps
  booked_at     TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  cancelled_at  TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

  -- ─── Constraints ─────────────────────────────────────────────────────────

  -- One slot → one booking (no double-sell)
  CONSTRAINT one_booking_per_slot UNIQUE (slot_id),

  -- Cancellation timestamp only allowed when status is cancelled
  CONSTRAINT cancelled_at_requires_status CHECK (
    cancelled_at IS NULL OR status = 'cancelled'
  )
);

-- ─── CRITICAL: One active booking per user ───────────────────────────────────
-- Partial unique index: enforced only while booking is active.
-- Cancelled bookings are excluded so the user can rebook after cancelling.
CREATE UNIQUE INDEX one_active_booking_per_user
  ON bookings(user_id)
  WHERE status IN ('pending', 'confirmed', 'reassigned');

-- ─── Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX idx_bookings_user_id   ON bookings(user_id);
CREATE INDEX idx_bookings_slot_id   ON bookings(slot_id);
CREATE INDEX idx_bookings_status    ON bookings(status);

-- ─── Auto-update trigger ─────────────────────────────────────────────────────
CREATE TRIGGER trg_bookings_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Comments ────────────────────────────────────────────────────────────────
COMMENT ON TABLE bookings IS
  'One row per user-slot claim. Use SELECT FOR UPDATE on slots when inserting.';
COMMENT ON INDEX one_active_booking_per_user IS
  'DB-level guard: user can only hold one active booking at a time.';
COMMENT ON COLUMN bookings.reassigned_to IS
  'Set by admin when original interviewer is deactivated mid-booking.';
