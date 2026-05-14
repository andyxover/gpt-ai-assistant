# TCS Tutor — Deployment Plan

From demo to school-wide. Start narrow, prove it works, then expand.

---

## TL;DR

| | |
|---|---|
| **Initial scope** | Grade 7 Science (Science 7) only — one subject, one grade. |
| **Pilot size** | 1 class (~25-30 students), 1 lead teacher, 4 weeks. |
| **Decision gate** | After Week 10. If success criteria are hit, expand. If not, iterate or stop. |
| **Path to whole school** | ~9 months minimum, with explicit go/no-go gates at every expansion. |
| **Headline cost (Pilot)** | ~USD $1,500-2,500 in software / hosting; lead teacher's time is the real investment. |
| **First paying surface** | Parent weekly digest (Phase 2) — start as free, premium tier introduced in Phase 4. |

---

## 1. Goal & non-goals

**Goal:** Prove that TCS Tutor measurably improves student learning in one
specific subject + grade band, then systematically expand.

**Non-goals (explicitly):**
- Building a "school AI platform" before proving any single subject works.
- Adding more subjects, grades, or features before the Science 7 pilot
  produces measurable results.
- Replacing teachers. The product amplifies teachers; teachers stay in
  the loop on content review and student progress.
- Generating fully autonomous AI content with zero human review. Every
  question and explanation in v1 gets teacher sign-off before reaching
  students.

---

## 2. What "it works" means — success criteria for Pilot

These are the gates. Before Phase 4 (expansion), all four must be met.

| Criterion | Target | Why this number |
|---|---|---|
| **Student adoption** | ≥70% of pilot class uses TCS Tutor at least 2x/week | Below this, it's an enthusiast tool, not a class tool. |
| **Learning outcome** | Pilot class scores ≥5 percentage points higher on the Mid-Term than a matched control class (or vs. the same teacher's previous semester) | Engagement is meaningless if learning doesn't move. |
| **Teacher experience** | Lead teacher rates the platform 4+ / 5 on usefulness, would recommend to a colleague | If teachers don't trust it, no rollout works. |
| **Parent retention** | <10% opt-out from weekly reports after 4 weeks | If parents are silently turning it off, the report isn't right yet. |

**Anti-criteria** — explicitly NOT used as success metrics:
- Daily active users / time-in-app (engagement doesn't equal learning)
- Number of questions asked (volume isn't quality)
- Parent NPS based on "love the AI" survey wording (vague enthusiasm is noise)

---

## 3. Phase-by-phase plan

### Phase 0 — Foundation (Weeks 1-2)

**Goal:** Make the abstract real. Names, dates, a budget.

- [ ] Confirm decision-makers: who at TCS signs off on each gate.
- [ ] Identify and confirm the **lead Science 7 teacher** — must be willing
      to invest ~6 hours/week during Phases 1-2 for content review.
- [ ] Choose pilot class — 1 of the 3 Science 7 sections. Recommend the
      teacher's own homeroom for highest engagement.
- [ ] Draft and obtain **parental consent** for pilot students (data
      collection on minor learners; required before Phase 2).
- [ ] Stand up infrastructure:
  - Anthropic Claude API account (production keys)
  - Postgres database (managed — Supabase or Neon)
  - Hosting (Vercel for frontend, Fly.io for any background jobs)
  - LINE Official Account for TCS Tutor
- [ ] Set up basic auth / SSO if integrating with TCS's existing system.
- [ ] Define metrics dashboard — what we'll watch each week of the pilot.

**Risk if skipped:** Project becomes "we'll figure it out later" — and
later never comes.

### Phase 1 — Real-content build (Weeks 3-6)

**Goal:** Replace demo content with real Science 7 Semester 1 material,
end-to-end. Internal testing only — no real students yet.

- [ ] Lead teacher uploads real Science 7 syllabus (full semester).
- [ ] Run AI scope extraction. **Teacher reviews and corrects** the
      output. Track edit rate — if >20%, the parser needs work before pilot.
- [ ] Generate question bank: ~15-20 questions per concept × ~25 concepts
      ≈ 400 questions for Semester 1. AI generates; **teacher reviews 100%
      of them** before they go live.
  - Track which AI-generated questions teacher rejects and why. This
    becomes input for prompt iteration.
- [ ] Generate per-concept explanations and analogies. Same teacher review.
- [ ] Implement the three surfaces with real content:
  - **Teacher dashboard** (web)
  - **Student LINE bot** (rich messages + chat)
  - **Parent weekly digest** (LINE rich message, sent Sunday evenings)
- [ ] Internal testing: 3-5 teacher beta users (not the lead teacher; other
      Science teachers, ideally). Goal — find UX bugs and content issues
      before students see anything.
- [ ] Build the eval harness:
  - Frozen set of 50 student questions (drawn from past TCS quizzes)
  - Weekly run: does the AI's diagnostic match the teacher's diagnosis?
  - Outcome metric: tracked from Phase 2 onward

**Exit criterion:** Lead teacher signs off on all generated content as
"would teach this in my own class." Beta teachers find no critical UX bugs.

### Phase 2 — Closed pilot (Weeks 7-10)

**Goal:** Real students, 4 weeks, measure everything.

- [ ] Soft launch to the pilot class. Onboarding session with students
      (15 minutes in class) — show the LINE bot, demonstrate one Review
      flow live.
- [ ] Send first parent letter (English + Chinese) explaining what the
      pilot is, what data is collected, opt-out process.
- [ ] Daily teacher review of every student interaction in Week 1, then
      tapering — Week 1 daily, Week 2 every other day, Weeks 3-4 weekly.
      The point isn't to monitor students; it's to catch AI mistakes early.
- [ ] First parent weekly digest goes out at end of Week 2 (gives time for
      enough data to populate the trend charts).
- [ ] Track metrics weekly:
  - Adoption: who used it, how many sessions
  - Engagement: average session length, questions per session
  - Quality: AI hallucinations flagged by teacher, % of interactions
    that needed teacher correction
  - Outcome: weekly mini-quiz scores in the pilot class vs. a matched
    section that didn't use TCS Tutor
- [ ] Conduct mid-pilot interviews: 5 students, 2 parents, the lead teacher.
      Open-ended — what's working, what isn't.

**Exit:** Mid-Term exam (Week 9 or 10) administered. Compare pilot class
score to control. **This is the moment of truth.**

### Phase 3 — Decision gate (Week 11)

**Decide:** Did the pilot work?

Bring all four success criteria to the table. Write a one-page report.
Three possible outcomes:

- **Green light** → Expand to all 3 Science 7 sections (Phase 4).
- **Yellow** (mixed results, learning gain <5pp but teacher loves it) →
  Iterate for 4 more weeks with same pilot, re-test on next mini-exam.
- **Red light** → Stop. Diagnose what failed. Possibly rebuild Phase 1
  with a different approach. Don't expand a broken thing.

This decision gate is **non-negotiable**. Skipping it means deploying a
product nobody has proven works — which is exactly what kills most edtech
rollouts.

### Phase 4 — Science 7 expansion (Weeks 12-15)

**Goal:** All 3 Science 7 sections, ~90 students, 4 weeks.

- [ ] Train the other 2 Science 7 teachers on the platform (~3 hours
      each: dashboard tour, content review workflow, how to interpret
      class progress).
- [ ] Each teacher uploads/reviews their own version of the syllabus
      (they may pace differently; system must support per-class scope).
- [ ] Onboard remaining ~60 students (parental consent must be in hand
      first).
- [ ] Continue weekly metrics tracking. **Look specifically for whether
      the learning gain holds at scale** — a common failure mode is the
      pilot working because the lead teacher is exceptional, and gains
      vanish when other teachers run it.
- [ ] Refine question banks based on observed mistakes patterns from
      Phase 2 — concepts that students commonly fail get more questions.
- [ ] Introduce **paid parent tier** as an A/B experiment:
  - Free: basic weekly mastery report
  - Paid (TWD ~300/month?): predictions, exam prep digests, child-specific
    practice recommendations
  - This is the first revenue test.

### Phase 5 — Decision gate (Week 16)

Same gate as Phase 3, applied at scale. Did the gains hold?

If yes: proceed to Phase 6.
If no: figure out why before expanding further.

### Phase 6 — Expansion across STEM (Weeks 17-30)

**Sequential, not parallel.** Each subject is its own mini-project.

| Order | Subject | Why this order | Effort |
|---|---|---|---|
| 6a | Science 8 | Grade 7 → 8 reuses ~70% of platform; new content, same pedagogy. | 8 weeks |
| 6b | Science 6 | Down-grade extension; useful for incoming Grade 7 review. | 6 weeks |
| 6c | Math 7 | First non-science subject. **Requires symbolic verification layer** (see Phase 6c-prep below). | 12 weeks |
| 6d | Math 8, Math 6 | Reuses Math 7 work. | 8 weeks each |
| 6e | High school Science (Bio, Chem, Physics) | Larger curriculum; more concept depth. | 16 weeks |

**Phase 6c-prep (4 extra weeks before Math launch):**
Math is fundamentally different from biology — students show their work,
arithmetic correctness must be ground-truth verifiable, and LLMs are
known to hallucinate calculations. Before launching Math 7 we need:
- A SymPy-based math verification microservice
- Step-by-step work parsing (OCR + structured representation)
- A different question UX (not just MCQ — show-your-work problems)

Don't skip this. Launching Math 7 without these is the fastest way to
lose teacher trust.

### Phase 7 — Non-STEM (Weeks 31+)

English, History, etc. Different pedagogy entirely (essays, comprehension,
discussion). Treat each as a mini-project with its own lead teacher and
its own decision gates. Don't promise this in advance — earn the right
to expand here only after STEM is solid.

---

## 4. Team & roles

| Role | Phase 0-1 | Phase 2 | Phase 4+ | Notes |
|---|---|---|---|---|
| **Lead Science 7 teacher** | 6 hrs/wk | 4 hrs/wk | 2 hrs/wk | Owns content review, mid-term assessment design. Highest-leverage hire. |
| **Other Science 7 teachers** | — | — | 2 hrs/wk each | Brought in at Phase 4. |
| **ML/backend engineer** | full-time | full-time | full-time | Schema, AI integration, evals. |
| **Frontend engineer** | half-time | full-time | full-time | Teacher dashboard first, parent reports second. |
| **Product owner** (likely founder) | half-time | half-time | full-time | Owns the eval criteria, runs decision gates, manages teacher relationships. |
| **Operations / school liaison** | quarter-time | half-time | half-time | Parental consent, communication, scheduling. Critical and underrated. |

**Critical principle:** the lead teacher must be in place **before** Phase 0
starts. Don't build infrastructure for a teacher who hasn't agreed to it.

---

## 5. Tech infrastructure

| Layer | Choice | Notes |
|---|---|---|
| Student channel | LINE Official Account | Existing infrastructure (this repo). |
| Teacher channel | Web app (Next.js) | New build for this project. |
| Parent channel | LINE rich message + web view | Same Official Account, separate flows. |
| Backend API | Node.js / Express (this repo) | Extends existing app. |
| Database | Postgres + pgvector | Pedagogy graph + retrieval. Use Supabase for managed setup. |
| LLM (pedagogy + chat) | Claude Sonnet 4.6 | Strong at structured rubric-following. |
| LLM (cheap classification, OCR) | GPT-4o-mini or Gemini Flash | Cost optimization for high-volume tasks. |
| Math verification (Phase 6c+) | Python + SymPy microservice | Non-negotiable before Math launch. |
| Hosting | Vercel (web) + Fly.io (Python) | Match existing deploy patterns. |
| Observability | Structured logs → Postgres | Every AI interaction queryable for audit. |
| Auth | School SSO if available; otherwise email magic-link | Coordinate with TCS IT. |

---

## 6. Content strategy

**Source of truth:** the lead teacher's syllabus + textbook + past exams.

**Build pattern per concept:**
1. Teacher provides 2-3 anchor examples of common student mistakes.
2. AI generates ~15 questions targeting that concept, varied difficulty.
3. Teacher reviews in batches (estimated 5 minutes per 10 questions).
4. Approved questions go into the production bank, tagged by concept.
5. As real student data accumulates, the engine prefers questions that
   have discriminated well between strong and weak students in past use.

**Quality bar (do not deploy questions that fail):**
- Single unambiguous correct answer
- Distractors are realistic — they reflect actual student misconceptions
- Explanation cites the concept and is at student reading level
- No cultural assumptions that don't apply to TCS students

**Refresh cadence:** quarterly content review with lead teachers, with
the option to retire questions that have been answered too many times
correctly (no longer discriminating).

---

## 7. Risks & mitigations (school-specific)

| Risk | Mitigation |
|---|---|
| **AI gives a student wrong information** | Every interaction logged + teacher review; every question reviewed before deployment; honest "I don't know" if outside scope. |
| **Parents complain about AI tutoring their child** | Opt-in only with explicit consent. Parent dashboard makes the AI's behavior fully transparent. Lead with the calibration story: "follows YOUR child's teacher's syllabus." |
| **Teachers feel replaced** | Pitch from day one as "amplifier, not replacement." Teachers explicitly own content review and student progress monitoring. Their name appears in every AI message. |
| **School IT compliance / privacy** | Data residency in Taiwan if required. PII separated from learning data. Annual privacy audit. Get written approval from TCS administration before Phase 2. |
| **Pilot teacher leaves** | Don't single-thread on one person. By end of Phase 4 at least 2 other teachers should be self-sufficient on the platform. Document everything. |
| **Mid-term shows no improvement** | Phase 3 decision gate exists for exactly this. Don't paper over a null result. Diagnose honestly. |
| **Cost spirals as adoption grows** | Cap LLM spend per student per month. Cache aggressively (problem-hash → response). Use cheaper models for classification, expensive only for explanation. Target ~USD $3-5/active student/month. |
| **Students cheat using TCS Tutor on homework** | Hint-only mode by default. Teacher-configurable: full answer reveal disabled until N failed attempts. Every interaction is auditable. |
| **Parents become anxious from weekly reports** | Calibration discipline — alerts fire only on the 1-2 weakest concepts, not the full list. Phrasing is "observation + suggested action," not "your child is failing." |
| **Single class pilot is too small to be statistically significant** | Use the matched-control design (compare to another section without TCS Tutor, taught by the same or comparable teacher). Mid-term scores are the primary outcome. |

---

## 8. Communication plan

| Audience | When | Channel | Message |
|---|---|---|---|
| **TCS administration** | Before Phase 0 | Meeting + 1-page proposal | Get sign-off on goals, scope, budget. |
| **Lead teacher** | Phase 0 | 1:1 working sessions | Co-design the rollout. Make them a co-author. |
| **All Science teachers** | Start of Phase 1 | Faculty meeting | Preview, set expectations, recruit feedback. |
| **Pilot students** | Start of Phase 2 | 15-min in-class session | Show the bot, walk through one Review flow live. |
| **Pilot parents** | Start of Phase 2 | Letter (English + Chinese) | Explain pilot, data collection, consent, opt-out. |
| **All Science 7 parents** | Phase 4 | LINE Official Account broadcast | Announce wider rollout, link to FAQ. |
| **Whole school** | Phase 6 | Faculty + parent newsletter | Only after Phases 4-5 succeed; don't pre-announce. |

**Key principle:** never announce a phase before its predecessor has met
its decision gate. Premature announcements create commitments you can't
walk back if data is bad.

---

## 9. Cost estimate (rough, refine in Phase 0)

| Phase | Duration | LLM API | Hosting | Total monthly |
|---|---|---|---|---|
| 0-1 | Weeks 1-6 | ~$200 | ~$50 | ~$250/mo |
| 2 (pilot ~30 students) | Weeks 7-10 | ~$300 | ~$50 | ~$350/mo |
| 4 (~90 students) | Weeks 12-15 | ~$700 | ~$80 | ~$780/mo |
| 6+ (Science K-12 ~600 students) | Months 5-9 | ~$3,000 | ~$200 | ~$3,200/mo |
| Whole school (~2,000 students, all subjects) | 12+ months | ~$8,000 | ~$400 | ~$8,400/mo |

**Per-student cost target:** USD $4-5/active student/month at full scale.
At TWD ~150-200/month, parent paid tier covers cost cleanly with margin.

**Headcount cost:** dominant. ~2 engineers + 0.5 PM + lead teacher's
time. School probably absorbs the teacher cost as part of normal duties;
engineering is the hard ask.

**Total budget for Pilot through Phase 5 (~16 weeks):**
roughly USD $20K - 40K depending on whether engineers are existing
hires or external contractors.

---

## 10. What success looks like at 12 months

- All 3 Science 7 sections using TCS Tutor as a normal part of the
  weekly routine.
- Documented learning gain on standardized assessments vs. baseline.
- Science 6 and Science 8 onboarded.
- Math 7 in Phase 4 (pilot complete, expanding).
- Parent paid tier converting at ~30%+ of eligible families.
- Lead teacher giving talks about it at education conferences.

If we're not somewhere close to this in 12 months, something in the
plan was wrong and we need to go back to the gates.

---

## 11. What "stopping" looks like

If the Phase 3 gate fails — be honest. Possible recovery paths:

- **The product was wrong:** rebuild Phase 1 with a different approach
  (different question style, different scope discipline, different UX).
- **The teacher was wrong fit:** find a different lead teacher, restart Phase 0.
- **The premise was wrong:** TCS doesn't actually need this. End the
  project. Better to lose 3 months than 18.

A failed pilot is not a failure — it's the cheapest way to find out the
truth. The expensive failure is shipping a product that doesn't work to
600 students.

---

## 12. Appendix — first-week kickoff checklist

When this plan is approved and we're starting Phase 0 next Monday:

- [ ] Confirm lead Science 7 teacher in writing
- [ ] Block 6 hours/week on lead teacher's calendar for Weeks 1-6
- [ ] Stand up Postgres + pgvector
- [ ] Get Anthropic API key with production billing
- [ ] Set up TCS Tutor LINE Official Account
- [ ] Draft parental consent form (legal review)
- [ ] Identify pilot class and matched control class
- [ ] Schedule weekly status sync (15 min, every Monday)
- [ ] Define week-by-week metrics dashboard
- [ ] Create shared folder for content review (lead teacher + engineers)

---

*Versioned alongside the broader spec at
`claude/project/ai-tutoring-platform/SPEC.md`. The TCS Tutor is the
first concrete implementation of that platform vision, narrowed to a
single school's deployment.*
