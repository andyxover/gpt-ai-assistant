# TCS Tutor — backbone

Production code for TCS Tutor. The demo at `../demo.html` is the spec;
this folder turns it into a real, deployable system.

## Status

**v0 — scaffold.** What exists today:

- [x] Data model (`db/schema.sql`) — full Postgres schema
- [x] Anthropic client wrapper (`lib/claude.js`)
- [x] Postgres client wrapper (`lib/db.js`)
- [x] **Syllabus parser** (`services/syllabus-parser.js`) — raw teacher
      syllabus → structured scope. First working AI service.
- [x] CLI to test the parser end-to-end (`cli/parse-syllabus.js`)
- [x] Sample syllabus for testing (`samples/science-7-syllabus.txt`)
- [x] **Question generator** (`services/question-generator.js`) —
      concept + difficulty range → batch of MCQs with schema validation
      and safety-critical refusal.
- [x] **Multi-pass quality validator** (`services/question-validator.js`)
      — self-critique + cross-model + fact-anchor → approve / reject /
      needs_review. Implements DEPLOYMENT.md §3 Layer 2.

- [x] **End-to-end content pipeline CLI** (`cli/generate-questions.js`)
      — parse → generate → validate, with per-question decisions, cost,
      and a 95%-bar warning when the batch is below the DEPLOYMENT §3
      threshold.
- [x] **Mastery engine** (`services/mastery-engine.js`) — transactional
      attempt recording, EMA-based mastery update, adaptive concept
      selector (review / preview / exam-prep with prereq gating), and
      difficulty-banded question selector with anti-repeat window.
- [x] **End-to-end simulation CLI** (`cli/simulate-session.js`) —
      seeds demo class + student, builds a validated question pool,
      runs a simulated session against the mastery engine. First time
      the whole stack runs as one program.
- [x] **Parent report renderer** (`services/report-renderer.js` +
      `cli/render-report.js`) — deterministic data + AI narrative on
      top + EN/ZH labels. Plain text and minimal HTML output, optional
      persistence into `parent_reports`.

## What's next (in order)

- [ ] LINE webhook handler (`api/line.js`)
- [ ] LINE webhook handler (`api/line.js`)
- [ ] Teacher dashboard (separate Next.js subapp)
- [ ] Eval harness (`evals/`)

See `../DEPLOYMENT.md` for phase-by-phase plan.

## Architecture (current + planned)

```
                     ┌─────────────────────────┐
                     │  Teacher uploads        │
                     │  syllabus               │
                     └───────────┬─────────────┘
                                 │
                ┌────────────────▼────────────────┐
                │  syllabus-parser.js  ✓          │
                │  LLM → structured scope         │
                └────────────────┬────────────────┘
                                 │
                ┌────────────────▼────────────────┐
                │  Teacher confirms / edits scope │
                │  (teacher dashboard)            │
                └────────────────┬────────────────┘
                                 │
       ┌─────────────────────────┼─────────────────────────┐
       │                         │                         │
┌──────▼──────┐         ┌────────▼────────┐       ┌────────▼────────┐
│ question-   │ ──────► │ question-       │ ───► │ Live question    │
│ generator   │ generate│ validator       │ pass │ pool             │
│             │         │ (multi-pass)    │      │                  │
└─────────────┘         └─────────────────┘      └──────────────────┘
                                                          │
                                                          │ used by
                                                          ▼
                                  ┌───────────────────────────────────┐
                                  │  mastery-engine.js                │
                                  │  picks next question per student  │
                                  └─────────────┬─────────────────────┘
                                                │
                                  ┌─────────────▼──────────────┐
                                  │ Student LINE bot (api/)    │
                                  │ Teacher dashboard          │
                                  │ Parent weekly digest       │
                                  └────────────────────────────┘
```

## Setup

1. Install Postgres locally OR set up a managed Postgres (Supabase, Neon).
2. Create the schema:
   ```bash
   psql $DATABASE_URL -f db/schema.sql
   ```
3. Copy `.env.example` to `.env` and fill in your Anthropic API key + DB URL.
4. Install deps:
   ```bash
   npm install
   ```
5. Test the syllabus parser:
   ```bash
   node cli/parse-syllabus.js samples/science-7-syllabus.txt
   ```
6. Run the full content pipeline (parse → generate → validate):
   ```bash
   # See available concepts
   node cli/generate-questions.js samples/science-7-syllabus.txt --list

   # Generate + validate for one concept
   node cli/generate-questions.js samples/science-7-syllabus.txt \
     --concept cell_membrane --count 5 --verbose
   ```
7. Run the full stack end-to-end (seeds DB, generates questions,
   simulates a student session, prints mastery trajectory):
   ```bash
   node cli/simulate-session.js samples/science-7-syllabus.txt \
     --concepts 3 --rounds 25

   # Re-run cheaply without regenerating the question pool:
   node cli/simulate-session.js samples/science-7-syllabus.txt \
     --reuse-questions --rounds 50
   ```
8. Render the parent weekly digest off the data the simulator just
   produced:
   ```bash
   # English, plain output to stdout + HTML to /tmp/tcs-report.html
   node cli/render-report.js --week 5

   # Traditional Chinese version, persisted to parent_reports table
   node cli/render-report.js --week 5 --lang zh --persist

   # Deterministic (no AI narrative) — free, useful for diff testing
   node cli/render-report.js --week 5 --skip-narrative
   ```

You should see structured JSON output and a small cost estimate.

## Decisions captured

- **AI-generated content, not curated.** See `../DEPLOYMENT.md` §3 for
  the quality pipeline that replaces upfront teacher review.
- **Postgres-only persistence.** No separate vector store yet — pgvector
  if we need retrieval later.
- **ESM modules** (`"type": "module"`). Matches parent repo style.
- **No ORM.** Schema is the source of truth; queries are plain SQL.
  ORMs add abstraction we don't need at this size.
- **No tests yet.** Will add in Phase 1 once shape stabilizes. CLI is
  the smoke test for now.
