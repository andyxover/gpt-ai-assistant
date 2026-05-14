# TCS Tutor — Deployment Plan

From demo to school-wide. Build the backbone, generate content with AI,
validate at the edges. Start narrow, prove it works, then expand.

> **Revision history:**
> v1 (previous) assumed teacher-curated content as the moat (carried over
> from the broader platform SPEC). v2 (this version) leans on AI-generated
> content with an automated quality pipeline, since school curricula are
> public and modern LLMs handle middle-school science factually well. The
> moat moves from "encoded teacher expertise" to "school distribution +
> UX + speed of iteration."

---

## TL;DR

| | |
|---|---|
| **Initial scope** | Grade 7 Science (Science 7) only — one subject, one grade. |
| **Approach** | Build the platform backbone. Generate questions, explanations, and practice content with AI per teacher's uploaded syllabus. Validate quality through an automated pipeline + light teacher spot-check + student flagging. |
| **Pilot size** | 1 class (~25-30 students), 1 lead teacher, 4 weeks. |
| **Timeline to pilot launch** | ~10 weeks (Phase 0 through Phase 3). |
| **Decision gate** | Week 13. If success criteria are hit, expand. If not, iterate or stop. |
| **Path to whole school** | ~9 months minimum, with explicit go/no-go gates at every expansion. |
| **Lead teacher commitment** | ~2 hrs/week during build, ~1 hr/week during pilot (down from 6 hrs/week in v1). |

---

## 1. Goal & non-goals

**Goal:** Prove that TCS Tutor measurably improves student learning in one
specific subject + grade, then systematically expand.

**Non-goals (explicitly):**
- Building a "school AI platform" before proving any single subject works.
- Curating proprietary content by hand. Modern LLMs know Grade 7 science
  cold; we generate per-syllabus and validate, not pre-author.
- Adding more subjects, grades, or features before the Science 7 pilot
  produces measurable learning results.
- Replacing teachers. The product amplifies teachers; teachers stay in
  the loop on syllabus scope, flagged content, and student progress.
- A platform we license to other schools. That's a different product
  with a different moat (see §11). For now, this is TCS-only.

---

## 2. What "it works" means — success criteria for pilot

Four gates. Before Phase 6 (expansion), all must be met.

| Criterion | Target | Why this number |
|---|---|---|
| **AI content quality** | ≥95% of generated questions pass teacher spot-check (random 10% sample, weekly) | Below this, hallucinations are a trust killer at scale. |
| **Student adoption** | ≥70% of pilot class uses TCS Tutor ≥ 2x/week | Below this, it's an enthusiast tool, not a class tool. |
| **Learning outcome** | Pilot class scores ≥5 percentage points higher on the Mid-Term than a matched control class | Engagement is meaningless if learning doesn't move. |
| **Teacher experience** | Lead teacher rates the platform 4+/5 on usefulness, would recommend to a colleague | If teachers don't trust it, no rollout works. |
| **Parent retention** | <10% opt-out from weekly reports after 4 weeks | If parents silently opt out, the report isn't right yet. |

**Anti-criteria** — explicitly NOT used as success metrics:
- Daily active users / time-in-app (engagement ≠ learning)
- Number of questions asked (volume ≠ quality)

---

## 3. The content quality pipeline (the key system change)

Since we're not having a teacher review every question upfront, here's
how we keep quality acceptable:

**Layer 1 — Generation, scope-locked:**
The question generator can only produce questions on concepts the teacher
confirmed during syllabus upload. Out-of-scope generation is blocked at
the system level.

**Layer 2 — Multi-pass LLM validation:**
Every generated question runs through:
- A second LLM call that grades it on factual accuracy, distractor
  quality, age-appropriateness, single-correct-answer property.
- A fact-anchor check: the explanation must match concepts present in
  the teacher's syllabus + standard textbook references.
- Questions below confidence threshold are auto-rejected; the generator
  retries with adjusted parameters.

**Layer 3 — Teacher spot-check (light, weekly):**
- 10% random sample of questions deployed that week appears in the
  teacher's dashboard, flagged for ~20 min of review.
- Teacher marks each as: approve / minor edit / reject.
- Reject rate >5% triggers automatic prompt iteration before next batch.

**Layer 4 — Student flagging:**
- Every question has a "flag this" button.
- Flagged questions go straight to the teacher queue.
- One flag for a confusing/wrong question doesn't fail it; two flags
  from different students removes it from rotation until reviewed.

**Layer 5 — Outcome telemetry:**
- Questions that no one ever gets right (or everyone always gets right)
  are auto-flagged as non-discriminating and rotated out.

**Hard rules — content the AI will NOT generate:**
- Lab safety content (small carve-out — always requires teacher author).
- Anything involving chemicals, electricity, or dangerous procedures
  beyond what's in the syllabus.
- Questions referencing specific students by name or any PII.

---

## 4. Phase-by-phase plan

### Phase 0 — Foundation (Weeks 1-2)

**Goal:** Make the abstract real. Names, dates, infrastructure standing up.

- [ ] Confirm decision-makers: who at TCS signs off on each gate.
- [ ] Identify and confirm the **lead Science 7 teacher** — commitment
      is ~2 hrs/week during Phases 1-3 (syllabus confirmation, weekly
      spot-checks).
- [ ] Choose pilot class — 1 of the 3 Science 7 sections (recommend
      the lead teacher's homeroom).
- [ ] Choose **matched control class** for outcome measurement —
      similar section, similar teacher, no TCS Tutor access during pilot.
- [ ] Draft and obtain **parental consent** for pilot students.
- [ ] Stand up infrastructure:
  - Anthropic Claude API account (production keys, billing)
  - Postgres (managed: Supabase or Neon)
  - Hosting (Vercel for web, Fly.io for any background workers)
  - LINE Official Account for TCS Tutor
- [ ] Define the metrics dashboard — what we track each week.

### Phase 1 — Build the backbone (Weeks 3-5)

**Goal:** End-to-end system flow works for one concept, generated
entirely from a teacher's syllabus. No real students yet.

What gets built:
- **Data model** (Postgres): classes, syllabi, concepts, questions,
  attempts, mastery, sessions, parent reports, flagged items.
- **Syllabus parser** (LLM): teacher uploads, AI extracts structured
  scope (chapter → week → concept), teacher confirms or edits.
- **Question generator** (LLM): given a concept + difficulty band,
  produces MCQ + explanation + distractor rationale.
- **Quality pipeline** (multi-LLM): generates → validates → either
  approves or rejects with retry. (See §3.)
- **Mastery engine**: adaptive selector that picks the next concept
  based on per-student mastery state, exactly as in the demo.
- **Eval harness** skeleton: daily question-quality grade, weekly
  scope-extraction accuracy.

**Exit:** for any one concept in any one syllabus, the full loop works
end-to-end. Internal demo to lead teacher only.

### Phase 2 — Quality validation at scale (Week 6)

**Goal:** Prove the content pipeline produces good content across
the full Semester 1 syllabus, before students see anything.

- [ ] Pre-generate ~300-500 questions across all Science 7 Semester 1
      concepts.
- [ ] Run them through the validation pipeline.
- [ ] Lead teacher reviews a **random 10% sample** (~30-50 questions,
      ~2 hours of work).
- [ ] Compute acceptance rate.
- [ ] **Gate:** ≥95% acceptance rate. If below, iterate generation
      prompts and re-test. Do not proceed to Phase 3 with a weak
      content pipeline.

This phase exists specifically because we skipped upfront content
curation. It's the moment we verify the AI's output meets the bar.

### Phase 3 — User-facing surfaces (Weeks 7-8)

- **Student LINE bot**: enrollment, scope display, three action modes
  (Review / Preview / Exam Prep), adaptive tutor chat with mastery
  panel, scope-locking, flagging.
- **Teacher dashboard** (web): syllabus upload + confirmation, class
  progress view, student activity, flagged question queue, weekly
  spot-check workflow.
- **Parent weekly digest** (LINE rich message + web): the structure
  from the demo, populated with real student data. Language toggle
  EN/ZH.
- Internal end-to-end test with 3-5 teacher beta users (not the lead
  teacher; ideally other Science teachers). Find UX bugs.

**Exit:** all three surfaces production-ready. Lead teacher signs off
on the experience.

### Phase 4 — Closed pilot (Weeks 9-12)

**Goal:** Real students, 4 weeks, measure everything.

- [ ] Onboarding session with pilot class (15 min in-class).
- [ ] Parent introduction letter (English + Chinese).
- [ ] Daily teacher review tapering: Week 1 daily, Week 2 every other
      day, Weeks 3-4 weekly (~20 min/week of spot-checking).
- [ ] First parent weekly digest at end of Week 2.
- [ ] Weekly metrics: adoption, engagement, quality (flag rate +
      spot-check accept rate), outcome (weekly mini-quiz vs. control).
- [ ] Mid-pilot interviews (Week 11): 5 students, 2 parents, lead teacher.

**Exit:** Mid-Term exam administered (Week 11 or 12 depending on TCS
schedule). Compare pilot class to control. This is the moment of truth.

### Phase 5 — Decision gate (Week 13)

Bring all five success criteria (§2) to the table. One-page report.
Three possible outcomes:

- **Green** → Expand to all Science 7 (Phase 6).
- **Yellow** (mixed results) → Iterate for 4 more weeks with same pilot,
  re-test on next mini-exam.
- **Red** → Stop. Diagnose what failed. Do not expand a broken thing.

Non-negotiable gate. Skipping = deploying unproven software to children.

### Phase 6 — Science 7 expansion (Weeks 14-17)

- [ ] Train other 2 Science 7 teachers (~2 hrs each: dashboard tour,
      spot-check workflow, how to interpret class progress).
- [ ] Each teacher uploads/confirms own syllabus version (per-class
      pacing supported).
- [ ] Onboard remaining ~60 students (consent in hand first).
- [ ] Watch carefully: does the learning gain hold at scale, or did it
      depend on the lead teacher being exceptional?
- [ ] Refine question banks based on observed mistake patterns from
      Phase 4 (concepts where students commonly fail get more questions).
- [ ] A/B test the **paid parent tier**:
  - Free: basic weekly mastery report
  - Paid (TWD ~200-300/mo): predictions, exam prep digests, per-child
    recommendations
  - First revenue test.

### Phase 7 — Decision gate (Week 18)

Same gate as Phase 5, applied at scale. Did gains hold?

### Phase 8 — Sequential expansion (Weeks 19-32)

| Order | Subject | Effort | Notes |
|---|---|---|---|
| 8a | Science 8 | 6 weeks | Reuses ~70% of platform. New syllabus, same pedagogy. |
| 8b | Science 6 | 4 weeks | Down-grade extension. Reuses Science 7 prereqs. |
| 8c | Math 7 | 10 weeks | **Requires symbolic verification layer** (SymPy microservice). Don't skip — math hallucinations are a different category of risk. |
| 8d | Math 8, Math 6 | 6 weeks each | Reuses Math 7 work. |
| 8e | HS Science (Bio, Chem, Physics) | 12 weeks | Larger curriculum, deeper concepts. |

**Phase 8c-prep (4 extra weeks before Math launch):**
LLMs hallucinate calculations confidently. Math launch requires:
- SymPy-based math verification microservice
- Show-your-work parsing (image → structured representation)
- Different question UX (not just MCQ)

### Phase 9 — Non-STEM (Weeks 33+)

English, History, etc. Different pedagogy entirely. Treat each as a
mini-project. Don't promise in advance — earn the right by succeeding
in STEM.

---

## 5. Team & roles

| Role | Phase 0-3 | Phase 4 | Phase 6+ | Notes |
|---|---|---|---|---|
| **Lead Science 7 teacher** | 2 hrs/wk | 1 hr/wk | 30 min/wk | Syllabus confirmation, weekly 10% spot-check, flagged question review. Much lighter than v1. |
| **Other Science 7 teachers** | — | — | 1 hr/wk each | Trained in Phase 6. |
| **ML/backend engineer** | full-time | full-time | full-time | Owns schema, AI integration, validation pipeline, evals. |
| **Frontend engineer** | half-time | full-time | full-time | Teacher dashboard first, parent reports second, polish ongoing. |
| **Product owner** (likely founder) | half-time | half-time | full-time | Owns eval rubrics, runs decision gates, manages teacher relationships. |
| **School liaison** | quarter-time | half-time | half-time | Parental consent, communication, scheduling. |

**Critical principle:** lead teacher must be in place **before Phase 0
starts**. Don't build infrastructure for a teacher who hasn't agreed.

---

## 6. Tech infrastructure

| Layer | Choice | Notes |
|---|---|---|
| Student channel | LINE Official Account | Extends this repo's LINE plumbing. |
| Teacher channel | Web app (Next.js) | New build. Lives at `claude/project/tcs-tutor/app/`. |
| Parent channel | LINE rich message + web view | Same LINE account, separate flows. |
| Backend API | Node.js / Express | Consistent with existing repo. |
| Database | Postgres (managed: Supabase) | Includes pgvector if needed for retrieval. |
| LLM (primary) | Claude Sonnet 4.6 | Question generation, validation, chat. Strong at structured reasoning. |
| LLM (validator) | GPT-4o-mini or Gemini Flash | Cross-model validation = less correlated hallucinations. |
| Math verifier (Phase 8c+) | Python + SymPy | Non-negotiable before Math launch. |
| Hosting | Vercel + Fly.io | Match existing deploy. |
| Observability | Structured logs → Postgres | Every AI interaction queryable. |
| Auth | School SSO if available; otherwise LINE OAuth or magic-link | Coordinate with TCS IT. |

---

## 7. Content strategy (revised)

**Source of truth:** the lead teacher's uploaded syllabus, period.

**Generation pattern per concept:**
1. AI generates 15-20 questions across difficulty bands.
2. Quality pipeline validates each (see §3).
3. Approved questions go into the live pool, tagged by concept.
4. Telemetry rotates out questions that fail discrimination (no one
   ever gets right, or everyone always gets right).
5. Teacher spot-checks 10% sample weekly; flagged questions and
   teacher-rejected questions feed back into prompt iteration.

**No upfront curation:** the content pool exists when the syllabus is
uploaded. New concepts → generate on demand the first time they're
requested by a student → cache.

**Refresh cadence:** quarterly content review with lead teachers. Retire
questions that are no longer discriminating. Generate fresh batches.

---

## 8. Risks & mitigations

| Risk | Mitigation |
|---|---|
| **AI gives a student wrong information** | Multi-pass validation; scope-locking; student flagging; weekly teacher spot-check; rapid retraction if a question is flagged twice. |
| **Subtle hallucinations slip through validation** | Cross-model validation (Claude generates, GPT or Gemini grades); fact-anchor cross-check against syllabus + reference material; outcome telemetry (concept-level pass rates flag drift). |
| **Quality drifts over time** | Quality is measured weekly during pilot, monthly post-pilot. If accept rate drops below threshold, freeze generation until prompts are fixed. |
| **Teachers feel sidelined** | Teacher's name appears in every AI message. Teacher dashboard shows everything happening. Teachers explicitly own flagged-content review and student progress monitoring. |
| **Parents complain about AI tutoring** | Opt-in only. Parent dashboard makes AI behavior fully transparent. Lead with: "follows YOUR child's teacher's syllabus." |
| **School IT compliance / minor data privacy** | Data residency in Taiwan if required. PII separated from learning data. Written approval from TCS administration before Phase 4. |
| **Lead teacher leaves** | By end of Phase 6, ≥2 other teachers self-sufficient on the platform. Document everything. |
| **Pilot shows no learning improvement** | Phase 5 decision gate exists for exactly this. Don't paper over a null result. |
| **Cost spirals as adoption grows** | Cache aggressively (concept+difficulty → cached questions); cheap models for classification, expensive only for explanation; cap LLM spend per student per month at ~USD $5. |
| **Students cheat using TCS Tutor on homework** | Hint-only mode by default. Teacher-configurable full-answer reveal. Every interaction is auditable. |
| **Parent anxiety from weekly reports** | Alerts fire only on 1-2 weakest concepts. Phrasing is "observation + suggested action," not "your child is failing." |
| **Single-class pilot too small to be statistically significant** | Matched-control design (compare to another section); mid-term exam scores as primary outcome; complement with weekly mini-quiz comparisons. |
| **AI generates safety-critical content incorrectly** | Hard system rule: lab safety content is teacher-authored only, not AI-generated. Same for any procedure involving heat, chemicals, electricity. |

---

## 9. Communication plan

| Audience | When | Channel | Message |
|---|---|---|---|
| **TCS administration** | Before Phase 0 | Meeting + 1-page proposal | Get sign-off on goals, scope, budget. |
| **Lead teacher** | Phase 0 | 1:1 working sessions | Co-design rollout. Make them a co-author. |
| **All Science teachers** | Start of Phase 1 | Faculty meeting | Preview, set expectations, recruit feedback. |
| **Pilot students** | Start of Phase 4 | 15-min in-class session | Show the bot live. |
| **Pilot parents** | Start of Phase 4 | Letter (EN + ZH) | Pilot scope, data collection, consent, opt-out. |
| **All Science 7 parents** | Phase 6 | LINE broadcast | Announce wider rollout, link to FAQ. |
| **Whole school** | Phase 8 | Newsletter | Only after Phases 5-7 succeed. |

**Key principle:** never announce a phase before its predecessor's
decision gate. Premature announcements create commitments you can't
walk back if data is bad.

---

## 10. Cost estimate

| Phase | Duration | LLM API | Hosting | Total monthly |
|---|---|---|---|---|
| 0-3 (build) | Weeks 1-8 | ~$300 | ~$50 | ~$350/mo |
| 4 (pilot ~30 students) | Weeks 9-12 | ~$400 | ~$50 | ~$450/mo |
| 6 (~90 students, 3 sections) | Weeks 14-17 | ~$900 | ~$80 | ~$980/mo |
| 8+ (Science K-12 ~600 students) | Months 5-9 | ~$3,500 | ~$200 | ~$3,700/mo |
| Whole school (~2,000 students, all subjects) | 12+ months | ~$10,000 | ~$400 | ~$10,400/mo |

**Per-student cost target:** USD $4-6/active student/month at scale.
At TWD ~150-250/mo, parent paid tier covers cost cleanly with margin.

Note: AI cost slightly higher than v1 because of validation pipeline
(2-3x model calls per generated question). Offset by zero teacher
curation cost.

**Headcount cost** dominates: ~2 engineers + 0.5 PM + lead teacher's
time. Lead teacher is absorbed into normal duties; engineering is the
real ask. Total Phase 0-5 build cost estimate: USD $25K-45K depending
on whether engineers are in-house or contracted.

---

## 11. The moat question — be clear-eyed

The v1 of this plan assumed proprietary teacher-curated content as the
moat. This v2 doesn't. What's our actual defensibility?

**For TCS-the-product (single school):**
- **Distribution**: we're embedded in TCS classrooms; teachers and
  parents already use it.
- **UX**: the teacher-scoped, parent-friendly experience is hard to
  replicate without inside knowledge of how TCS actually runs.
- **Trust**: weekly teacher attribution, transparent parent reports,
  full auditability.
- **Speed**: we iterate faster than anyone else can negotiate access.

That's enough for a single-school product. It's NOT enough if you later
want to license the platform to other schools — at that point you need
either: (a) proprietary fine-tuned models trained on TCS data, or (b)
a deeper pedagogy graph (which is the original SPEC moat). That's a
decision for ~12 months from now, not today.

---

## 12. What success looks like at 12 months

- All 3 Science 7 sections using TCS Tutor as a normal weekly routine.
- Documented learning gain vs. baseline.
- Science 6 + Science 8 onboarded.
- Math 7 in pilot (with verifier shipped).
- Parent paid tier converting at ≥25% of eligible families.
- Lead teacher publicly speaking about the platform.

If we're not close to this in 12 months, something in the plan was wrong
— go back to the gates.

---

## 13. What "stopping" looks like

If Phase 5 fails, be honest. Three recovery paths:
- **Product wrong**: rebuild with different approach (different question
  style, different scope discipline, different UX).
- **Wrong teacher fit**: find different lead teacher, restart Phase 0.
- **Premise wrong**: TCS doesn't actually need this. End the project.

A failed pilot isn't failure — it's the cheapest way to find out the
truth. The expensive failure is shipping to 600 students before
verifying it works on 25.

---

## 14. First-week kickoff checklist

When this plan is approved:

- [ ] Confirm lead Science 7 teacher in writing (commitment letter)
- [ ] Block 2 hours/week on their calendar for Weeks 1-8
- [ ] Stand up Supabase Postgres
- [ ] Get Anthropic API key with production billing
- [ ] Set up TCS Tutor LINE Official Account
- [ ] Draft parental consent form (legal review required)
- [ ] Identify pilot class AND matched control class
- [ ] Schedule weekly status sync (15 min, every Monday)
- [ ] Create shared folder for syllabus + content review
- [ ] First commit to `claude/project/tcs-tutor/app/`

---

*Versioned alongside the broader spec at
`claude/project/ai-tutoring-platform/SPEC.md`. The TCS Tutor is the
first concrete implementation of that platform vision, narrowed to a
single school's deployment with AI-generated content.*
