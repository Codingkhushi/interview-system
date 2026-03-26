-- Migration 001: Extensions and ENUMs
-- Run first. All other migrations depend on these types.

-- ─── Extensions ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";   -- uuid_generate_v4()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";    -- gen_random_uuid() (Postgres 13+)

-- ─── ENUMs ───────────────────────────────────────────────────────────────────

CREATE TYPE user_role AS ENUM (
  'user',           -- applicant going through interview
  'interviewer',    -- wingmann executive conducting interview
  'admin'           -- platform admin managing interviewers
);

CREATE TYPE auth_provider AS ENUM (
  'google',         -- OAuth via Gmail
  'local'           -- username/password (interviewers only)
);

CREATE TYPE slot_status AS ENUM (
  'available',      -- open for booking
  'booked',         -- claimed by a user
  'blocked'         -- interviewer manually blocked (holiday, etc.)
);

CREATE TYPE booking_status AS ENUM (
  'pending',        -- booked, interview not yet done
  'confirmed',      -- interview completed, outcome pending
  'cancelled',      -- user or admin cancelled
  'reassigned'      -- original interviewer deleted, pending new assignment
);

CREATE TYPE interview_outcome AS ENUM (
  'pending',        -- decision not made yet
  'accepted',       -- user accepted into wingmann
  'rejected'        -- user not accepted at this time
);
