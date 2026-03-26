-- Migration 003: Availability
-- Stores raw time ranges set by interviewers.
-- The backend materialises these into discrete 30-min rows in the slots table.

CREATE TABLE availability (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  interviewer_id  UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- The range the interviewer marked as available
  date            DATE        NOT NULL,
  start_time      TIME        NOT NULL,
  end_time        TIME        NOT NULL,

  -- Soft delete flag (set instead of DELETE when booked slots exist in range)
  is_deleted      BOOLEAN     NOT NULL DEFAULT FALSE,

  -- Audit
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- ─── Constraints ───────────────────────────────────────────────────────────
  CONSTRAINT end_after_start CHECK (end_time > start_time),

  -- Minimum 30-min range (must be able to produce at least one slot)
  CONSTRAINT min_range CHECK (
    end_time - start_time >= INTERVAL '30 minutes'
  ),

  -- No overlapping ranges for the same interviewer on the same date.
  -- Handled in application logic for now; enforce with exclusion constraint
  -- when pg btree_gist extension is available.
  CONSTRAINT unique_interviewer_date_range
    UNIQUE (interviewer_id, date, start_time, end_time)
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX idx_availability_interviewer ON availability(interviewer_id);
CREATE INDEX idx_availability_date        ON availability(date);

-- ─── Auto-update trigger ─────────────────────────────────────────────────────
CREATE TRIGGER trg_availability_updated_at
  BEFORE UPDATE ON availability
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Comments ────────────────────────────────────────────────────────────────
COMMENT ON TABLE availability IS
  'Raw time windows set by interviewers. Never query directly for slot display — use the slots table.';
COMMENT ON COLUMN availability.is_deleted IS
  'Set TRUE instead of DELETE when slots in range are booked. Prevents orphan slots.';
