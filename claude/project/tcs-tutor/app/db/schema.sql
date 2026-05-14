-- TCS Tutor — initial schema (v0)
-- Postgres 15+. Run once on a fresh database.
--
-- Design notes:
-- - UUID primary keys via gen_random_uuid() for portability.
-- - JSONB for flexible nested data (parsed scope, validation metadata).
-- - TIMESTAMPTZ everywhere (no naive timestamps).
-- - ON DELETE CASCADE on parent-of-tree relationships; RESTRICT on shared lookups.
-- - Indexes target the hot paths we know about; add more as queries emerge.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;          -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pg_trgm;           -- fuzzy text search

-- =============================================================
-- Organizational
-- =============================================================

CREATE TABLE schools (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  country_code  TEXT NOT NULL DEFAULT 'TW',
  timezone      TEXT NOT NULL DEFAULT 'Asia/Taipei',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  role          TEXT NOT NULL CHECK (role IN ('student', 'teacher', 'parent', 'admin')),
  display_name  TEXT NOT NULL,
  email         TEXT UNIQUE,
  line_user_id  TEXT UNIQUE,
  preferred_lang TEXT NOT NULL DEFAULT 'en' CHECK (preferred_lang IN ('en', 'zh')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at   TIMESTAMPTZ
);

CREATE INDEX users_school_role_idx ON users(school_id, role) WHERE archived_at IS NULL;

-- Parent → Student linkage (one parent can have multiple children, one child can have multiple parents)
CREATE TABLE parent_links (
  parent_user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  relationship     TEXT NOT NULL DEFAULT 'parent',
  consent_given_at TIMESTAMPTZ NOT NULL,
  consent_doc_url  TEXT,
  PRIMARY KEY (parent_user_id, student_user_id)
);

-- =============================================================
-- Classes & enrollment
-- =============================================================

CREATE TABLE classes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  teacher_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  subject         TEXT NOT NULL,        -- e.g. 'science', 'math'
  grade           INT NOT NULL,         -- e.g. 7
  section         TEXT NOT NULL,        -- e.g. '7A'
  display_name    TEXT NOT NULL,        -- e.g. 'Science 7A'
  academic_year   TEXT NOT NULL,        -- e.g. '2025-26'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at     TIMESTAMPTZ
);

CREATE INDEX classes_teacher_idx ON classes(teacher_user_id) WHERE archived_at IS NULL;
CREATE INDEX classes_grade_subject_idx ON classes(grade, subject) WHERE archived_at IS NULL;

CREATE TABLE enrollments (
  class_id      UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  enrolled_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  withdrawn_at  TIMESTAMPTZ,
  PRIMARY KEY (class_id, student_id)
);

-- =============================================================
-- Syllabus & scope
-- =============================================================

CREATE TABLE syllabi (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id                 UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  semester                 TEXT NOT NULL,        -- 'S1' / 'S2'
  raw_text                 TEXT NOT NULL,
  source_filename          TEXT,
  parsed_scope             JSONB,                -- output of syllabus-parser
  parser_model             TEXT,
  parser_uncertainties     JSONB,                -- _uncertainties array from parser
  teacher_confirmed_at     TIMESTAMPTZ,
  current_week             INT NOT NULL DEFAULT 1 CHECK (current_week BETWEEN 1 AND 30),
  uploaded_by_user_id      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  superseded_at            TIMESTAMPTZ
);

CREATE INDEX syllabi_class_active_idx ON syllabi(class_id, semester) WHERE superseded_at IS NULL;

-- Concepts extracted from the syllabus. Atomic units of learning.
CREATE TABLE concepts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  syllabus_id           UUID NOT NULL REFERENCES syllabi(id) ON DELETE CASCADE,
  code                  TEXT NOT NULL,           -- short ID, e.g. 'cell_membrane'
  name                  TEXT NOT NULL,           -- display name, e.g. 'Cell Membrane'
  chapter_title         TEXT,
  week_introduced       INT NOT NULL,
  week_last_taught      INT NOT NULL,
  sequence_order        INT NOT NULL,
  description           TEXT,
  is_safety_critical    BOOLEAN NOT NULL DEFAULT false,  -- hard rule: AI cannot generate questions here
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (syllabus_id, code)
);

CREATE INDEX concepts_syllabus_seq_idx ON concepts(syllabus_id, sequence_order);

-- Prerequisite edges between concepts (within a syllabus)
CREATE TABLE concept_prereqs (
  concept_id        UUID NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  prereq_concept_id UUID NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  strength          TEXT NOT NULL DEFAULT 'soft' CHECK (strength IN ('hard', 'soft')),
  PRIMARY KEY (concept_id, prereq_concept_id),
  CHECK (concept_id <> prereq_concept_id)
);

-- =============================================================
-- Questions (AI-generated, validated)
-- =============================================================

CREATE TABLE questions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id          UUID NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  body                TEXT NOT NULL,
  options             JSONB NOT NULL,           -- [{letter, text, correct, why}]
  correct_letter      TEXT NOT NULL CHECK (correct_letter ~ '^[A-D]$'),
  explanation         TEXT NOT NULL,
  difficulty          SMALLINT NOT NULL CHECK (difficulty BETWEEN 1 AND 5),
  -- Provenance
  source              TEXT NOT NULL CHECK (source IN ('ai_generated', 'teacher_authored', 'imported')),
  generator_model     TEXT,
  generator_prompt_hash TEXT,                   -- detect prompt-version drift
  generation_job_id   UUID,                     -- FK added below
  -- Validation
  validation_status   TEXT NOT NULL DEFAULT 'pending'
                        CHECK (validation_status IN ('pending', 'approved', 'rejected', 'needs_review')),
  validation_score    NUMERIC(4,3),              -- 0.000 - 1.000
  validation_metadata JSONB,                     -- full multi-pass output
  -- Lifecycle
  approved_at         TIMESTAMPTZ,
  approved_by         TEXT NOT NULL DEFAULT 'pipeline'
                        CHECK (approved_by IN ('pipeline', 'teacher', 'auto_rotation')),
  retired_at          TIMESTAMPTZ,
  retired_reason      TEXT,
  -- Telemetry rolled up from attempts (denormalized for speed)
  total_attempts      INT NOT NULL DEFAULT 0,
  total_correct       INT NOT NULL DEFAULT 0,
  total_flags         INT NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX questions_concept_status_idx ON questions(concept_id, validation_status)
  WHERE retired_at IS NULL;
CREATE INDEX questions_difficulty_idx ON questions(concept_id, difficulty)
  WHERE validation_status = 'approved' AND retired_at IS NULL;

-- Generation audit trail
CREATE TABLE generation_jobs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id        UUID NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  params            JSONB NOT NULL,             -- difficulty, count, prompt variant, etc.
  model             TEXT NOT NULL,
  status            TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  questions_generated INT,
  questions_approved  INT,
  cost_usd          NUMERIC(10,4),
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  error             TEXT,
  triggered_by_user UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE questions
  ADD CONSTRAINT questions_generation_job_fk
  FOREIGN KEY (generation_job_id) REFERENCES generation_jobs(id) ON DELETE SET NULL;

-- Validation audit trail (one row per validation pass per question)
CREATE TABLE validation_runs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id         UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  validator_pass      TEXT NOT NULL,           -- 'self_critique', 'cross_model', 'fact_anchor', 'teacher_spot_check'
  validator_model     TEXT,
  validator_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  score               NUMERIC(4,3),
  decision            TEXT NOT NULL CHECK (decision IN ('approve', 'reject', 'flag')),
  reasoning           JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX validation_runs_question_idx ON validation_runs(question_id, created_at DESC);

-- =============================================================
-- Student interactions
-- =============================================================

CREATE TABLE chat_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  class_id        UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  mode            TEXT NOT NULL CHECK (mode IN ('review', 'preview', 'exam_prep', 'free_chat')),
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at        TIMESTAMPTZ,
  summary         JSONB                       -- mastery deltas, concepts touched, etc.
);

CREATE INDEX chat_sessions_student_idx ON chat_sessions(student_id, started_at DESC);

CREATE TABLE chat_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('student', 'ai', 'system')),
  content     TEXT NOT NULL,
  question_id UUID REFERENCES questions(id) ON DELETE SET NULL,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX chat_messages_session_idx ON chat_messages(session_id, created_at);

CREATE TABLE attempts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id     UUID NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
  session_id      UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,
  answer_letter   TEXT CHECK (answer_letter ~ '^[A-D]$'),
  is_correct      BOOLEAN NOT NULL,
  time_taken_ms   INT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX attempts_student_time_idx ON attempts(student_id, created_at DESC);
CREATE INDEX attempts_question_idx ON attempts(question_id);

-- Per-student per-concept mastery state. Updated on every attempt.
CREATE TABLE mastery (
  student_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  concept_id        UUID NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  score             NUMERIC(5,2) NOT NULL CHECK (score BETWEEN 0 AND 100),
  attempts_count    INT NOT NULL DEFAULT 0,
  correct_count     INT NOT NULL DEFAULT 0,
  last_attempt_at   TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, concept_id)
);

CREATE INDEX mastery_concept_idx ON mastery(concept_id);

-- =============================================================
-- Flagging & safety
-- =============================================================

CREATE TABLE flagged_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id       UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  flagger_user_id   UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  flagger_role      TEXT NOT NULL CHECK (flagger_role IN ('student', 'teacher', 'parent', 'system')),
  reason            TEXT,
  status            TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed_kept', 'reviewed_edited', 'reviewed_rejected')),
  resolved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at       TIMESTAMPTZ,
  resolution_note   TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX flagged_items_open_idx ON flagged_items(question_id) WHERE status = 'open';

-- =============================================================
-- Parent reports
-- =============================================================

CREATE TABLE parent_reports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  class_id        UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  week_number     INT NOT NULL,
  week_starts     DATE NOT NULL,
  snapshot        JSONB NOT NULL,             -- full computed report (concepts, deltas, predictions)
  sent_at         TIMESTAMPTZ,
  opened_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, week_number, class_id)
);

CREATE INDEX parent_reports_student_week_idx ON parent_reports(student_id, week_number DESC);

-- =============================================================
-- General audit log
-- =============================================================

CREATE TABLE audit_log (
  id            BIGSERIAL PRIMARY KEY,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action        TEXT NOT NULL,                -- e.g. 'syllabus.confirmed', 'question.rejected'
  target_type   TEXT,
  target_id     TEXT,
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX audit_log_target_idx ON audit_log(target_type, target_id, created_at DESC);
CREATE INDEX audit_log_actor_idx ON audit_log(actor_user_id, created_at DESC);

-- =============================================================
-- Seed data — for local development only
-- =============================================================

INSERT INTO schools (id, name, country_code, timezone)
VALUES ('00000000-0000-0000-0000-000000000001', 'TCS (demo)', 'TW', 'Asia/Taipei')
ON CONFLICT DO NOTHING;

COMMIT;
