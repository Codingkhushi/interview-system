-- Migration 006: Interviews
-- One interview record per booking. Created when booking status moves to confirmed.
-- Interviewer writes the outcome here; observer pattern pushes it to user dashboard.

CREATE TABLE interviews (
  id              UUID              PRIMARY KEY DEFAULT uuid_generate_v4(),

  booking_id      UUID              NOT NULL UNIQUE
                                    REFERENCES bookings(id) ON DELETE CASCADE,
                                    -- UNIQUE: one interview per booking, always

  -- Denormalised for fast dashboard queries
  user_id         UUID              NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  interviewer_id  UUID              NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
                                    -- RESTRICT: preserve audit trail even if
                                    -- interviewer is deactivated

  outcome         interview_outcome NOT NULL DEFAULT 'pending',
  notes           TEXT,             -- internal interviewer notes (not shown to user)

  -- Timestamps
  decided_at      TIMESTAMPTZ,      -- set when outcome moves away from 'pending'
  created_at      TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ       NOT NULL DEFAULT NOW(),

  -- ─── Constraints ────────────────────────────────────────────────────────────
  CONSTRAINT decided_at_requires_outcome CHECK (
    decided_at IS NULL OR outcome <> 'pending'
  )
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────

-- User dashboard: "what is my interview outcome?"
CREATE INDEX idx_interviews_user_id    ON interviews(user_id);

-- Interviewer dashboard: "show me my upcoming + completed interviews"
CREATE INDEX idx_interviews_interviewer ON interviews(interviewer_id, outcome);

-- Admin monitoring: all interviews sorted by time
CREATE INDEX idx_interviews_created_at ON interviews(created_at DESC);

-- ─── Auto-update trigger ─────────────────────────────────────────────────────
CREATE TRIGGER trg_interviews_updated_at
  BEFORE UPDATE ON interviews
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Comments ────────────────────────────────────────────────────────────────
COMMENT ON TABLE interviews IS
  'Outcome record for each booking. Interviewer writes outcome; triggers notification to user.';
COMMENT ON COLUMN interviews.notes IS
  'Private interviewer notes. Never exposed to the user via API.';
COMMENT ON COLUMN interviews.decided_at IS
  'NULL until outcome is set. Used to calculate interviewer response times in admin view.';
