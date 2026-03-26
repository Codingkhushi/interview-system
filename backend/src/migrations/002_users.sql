-- Migration 002: Users table
-- Single table for all three actor types (user / interviewer / admin).
-- auth_provider + password_hash support both OAuth and local login in one row.

CREATE TABLE users (
  id                UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Identity
  email             TEXT          NOT NULL UNIQUE,
  name              TEXT          NOT NULL,
  age               SMALLINT      CHECK (age >= 18 AND age <= 120),
  gender            TEXT,
  city              TEXT,

  -- Auth
  role              user_role     NOT NULL DEFAULT 'user',
  auth_provider     auth_provider NOT NULL DEFAULT 'google',
  password_hash     TEXT,         -- NULL for Google OAuth users
  force_pw_change   BOOLEAN       NOT NULL DEFAULT FALSE,
                                  -- TRUE for new interviewers until they reset

  -- Account state
  is_active         BOOLEAN       NOT NULL DEFAULT TRUE,
                                  -- FALSE = soft-deleted interviewer
  profile_complete  BOOLEAN       NOT NULL DEFAULT FALSE,
                                  -- TRUE once name/age/gender/city submitted

  -- Audit
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_by        UUID          REFERENCES users(id) ON DELETE SET NULL
                                  -- admin who created an interviewer account
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX idx_users_role        ON users(role);
CREATE INDEX idx_users_email       ON users(email);
CREATE INDEX idx_users_is_active   ON users(is_active);

-- ─── Constraint: local users must have a password ─────────────────────────────
ALTER TABLE users ADD CONSTRAINT local_needs_password
  CHECK (
    auth_provider <> 'local' OR password_hash IS NOT NULL
  );

-- ─── Auto-update updated_at ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Comments ────────────────────────────────────────────────────────────────
COMMENT ON COLUMN users.force_pw_change IS
  'Set TRUE when admin creates interviewer. Cleared on first password reset.';
COMMENT ON COLUMN users.is_active IS
  'FALSE for soft-deleted interviewers. Their bookings are preserved.';
COMMENT ON COLUMN users.created_by IS
  'Populated when admin creates an interviewer account.';
