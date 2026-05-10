# AI Tutoring Platform — Build Spec

A phase-by-phase plan for turning cram-school teaching expertise into a
defensible AI tutoring product. Long-term scope: K-12 STEM (math, science).
Initial wedge: see Phase 0.

---

## 1. Vision

> An AI tutoring system whose moat is **encoded elite teaching expertise**,
> not the underlying LLM.

The product looks like a tutor. The asset is a **versioned, queryable
pedagogy graph** — concepts, prerequisites, misconceptions, diagnostic
probes, interventions, and measured outcomes — built and curated by real
teachers, sharpened by real student data.

Anyone can wrap GPT in a chat UI. Almost no one can answer:
*"This 13-year-old just wrote `(-3)² = -9`. What is the fastest
intervention that fixes the root cause and doesn't damage their
confidence?"* — and back the answer with evidence from 10,000 similar
students.

---

## 2. Strategic principles

1. **The moat is data + pedagogy structure, not the model.** The LLM is
   a commodity; swap it out yearly. The pedagogy graph compounds.
2. **One wedge first, then expand.** A dense graph in one subject/grade
   beats a sparse graph everywhere.
3. **Teacher-in-the-loop from day one.** Every AI output that touches a
   student must be traceable to a teacher-authored intervention or
   marked as "model freestyle, unreviewed."
4. **Hints, not answers.** The product diagnoses and scaffolds. It does
   not solve homework. This is both pedagogically right *and* defensible
   when parents/schools ask "is this cheating?"
5. **Verify math symbolically.** LLMs hallucinate arithmetic. A symbolic
   layer (SymPy / CAS) is non-negotiable for STEM.
6. **Evaluation is the second moat.** Without paired before/after
   rubrics on real student work, you can't prove the product teaches
   better than ChatGPT — and you can't improve it systematically.
7. **Ship in LINE first.** Taiwan parents and students already live
   there. Web/mobile apps come later.

---

## 3. Scope decision: where to start (and where to go)

**Recommended Phase 1 wedge:** 國中數學 (grades 7–9 math).

Why this wedge:

- Highest cram-school demand and willingness to pay.
- Curriculum is bounded and standardized (108 課綱 / 會考 reference).
- Math is the most symbolically verifiable subject — lowest hallucination
  risk for the MVP.
- Misconception literature is dense (decades of math-ed research).
- These concepts are **prerequisites** for HS math, physics, chemistry.
  A graph rooted here naturally extends *upward* and *sideways*.

Expansion sequence after the wedge is proven:

| Phase | Add | Rationale |
|---|---|---|
| 5a | 高中數學 (grades 10-12) | Reuses junior-high prereq graph; same teachers. |
| 5b | 國小高年級數學 (grades 5-6) | Remediation product; reuses graph going down. |
| 5c | 高中物理 / 化學 | Builds on math graph; introduces lab/experimental misconceptions. |
| 5d | 國小低中年級 (grades 1-4) | Different pedagogy (concrete/manipulative); separate authoring track. |
| 5e | 高中生物 / 國中理化 | Fill in the K-12 STEM matrix. |

Each expansion phase ≈ 8-12 weeks once the platform is stable.

---

## 4. The core pedagogy schema

This is the single most important deliverable of Phase 0. Get this wrong
and everything downstream rots. Approximate shape (Postgres):

```sql
-- A node in the curriculum graph
Concept (
  id, code, name_zh, name_en,
  subject, grade_band,
  bloom_level,           -- remember/understand/apply/analyze/...
  curriculum_refs[]      -- e.g. ["108課綱 國中數學 N-7-3"]
)

-- Directed edges: prereq_id must be mastered before concept_id
Prereq (concept_id, prereq_id, strength)  -- strength: hard/soft

-- A specific way students get this concept wrong
Misconception (
  id, concept_id,
  short_name,            -- e.g. "negative_squared_keeps_sign"
  description_zh,
  diagnostic_signal,     -- text + structured pattern (regex / AST)
  example_student_work[],
  root_cause_hypothesis, -- usually a weaker prereq concept
  prevalence_estimate
)

-- A teacher-authored fix for a misconception
Intervention (
  id, misconception_id,
  approach,              -- visual / analogy / drill / re-derive / ...
  explanation_zh,
  worked_example,
  practice_set_id,
  difficulty_progression,
  emotional_register,    -- gentle / direct / challenge
  prerequisites_to_revisit[]
)

-- Practice problems, tagged densely
Problem (
  id, concept_ids[], misconception_targets[],
  difficulty, statement, answer, solution_steps,
  source                 -- past exam / teacher-authored / generated
)

-- A single student interaction
StudentAttempt (
  id, student_id, problem_id, timestamp,
  raw_work,              -- text or image_id
  parsed_work,           -- structured (where possible)
  detected_misconceptions[], -- with confidence
  intervention_id_given,
  outcome,               -- solved_unaided / solved_with_hint / abandoned
  affect_signal,         -- frustration / engagement (later)
  teacher_reviewed_by, teacher_corrected_label
)

-- Per-student running model
StudentState (
  student_id,
  mastery_per_concept,   -- jsonb: {concept_id: {prob, last_seen, ...}}
  active_misconceptions[],
  pace, confidence_estimate,
  predicted_collapse_concepts[]
)
```

Versioning note: `Misconception` and `Intervention` rows must be
immutable once attached to `StudentAttempt`s. Edits create new versions.
Otherwise you can't reproduce or audit past tutoring decisions.

---

## 5. Phase 0 — Pedagogy schema + bootstrap (Weeks 1–2)

**Goal:** Lock the schema. Seed the catalog from existing assets.

Concrete deliverables:

- [ ] Postgres schema migration files in `db/migrations/`.
- [ ] Import scripts for existing teacher notes → `Misconception` rows.
      Even rough, free-text imports are fine; tag them
      `confidence=draft` and refine later.
- [ ] Import script for past test/exam results → derive
      `concept_mastery` snapshots per student.
- [ ] OCR pipeline for the scanned homework backlog (GPT-4o-mini or
      Google Vision). Output goes into `StudentAttempt.raw_work` +
      `parsed_work`. Do not auto-label misconceptions yet.
- [ ] Choose the **top 30 misconceptions** for grades 7–9 math with the
      lead teacher. These will be the seed targets for Phase 1.

Output: an empty-but-correct pedagogy database with ~30 high-quality
misconception entries and a backlog of unlabeled student work ready to
classify.

**Risk:** Schema bikeshedding. Timebox to 2 weeks. The schema *will*
change; the point is to make changes cheap, not to get it perfect.

---

## 6. Phase 1 — Teacher labeling pipeline (Weeks 3–6)

**Goal:** Build the **teacher dashboard**, not the student bot.

This is counterintuitive but critical. The labeling pipeline produces
the proprietary dataset that everything else depends on. The student
bot is meaningless until misconception detection works.

Flow:

1. Student work (from backlog OCR + new submissions via LINE) appears
   in a queue.
2. LLM (Claude Sonnet 4.6) proposes one or more misconception labels
   from the catalog, with confidence scores and quoted evidence from
   the student's work.
3. Teacher reviews on a dashboard: confirm / correct / add-new /
   reject. Average target: 30 seconds per attempt.
4. Confirmed labels become training data for the classifier and
   training signal for the eventual auto-labeler.

Concrete deliverables:

- [ ] Next.js teacher dashboard (internal tool, no need for polish).
- [ ] LLM classifier service: prompt-engineered, NOT fine-tuned yet.
      Use Claude Sonnet with a system prompt that includes the full
      misconception catalog (it's small — fits in context).
- [ ] Inter-rater reliability check: have 2 teachers label the same
      100 attempts. Target Cohen's kappa > 0.7. Below that, the
      catalog itself is ambiguous and needs rewriting.
- [ ] Active learning loop: prioritize attempts where the classifier
      is uncertain or teachers have historically disagreed.

**Exit criterion:** 1,000+ teacher-confirmed labeled attempts across
the top 30 misconceptions. Classifier hits >80% precision on a held-out
test set.

**Risk:** Teacher labeling capacity. Budget realistically: a teacher
labeling 30s/attempt × 1,000 attempts ≈ 8 hours. Spread across 2-3
teachers over 4 weeks, this is fine. Don't try to label 10,000 in v1.

---

## 7. Phase 2 — AI Homework Companion MVP (Weeks 7–12)

**Goal:** First student-facing product. Ships in the LINE bot.

User flow (LINE):

1. Student sends a photo of a homework problem + their attempted work.
2. OCR + parse.
3. Classifier identifies misconception(s).
4. **Symbolic verifier** (Python + SymPy microservice) independently
   checks whether the student's answer is actually right/wrong and
   where the first error step is. This is the ground-truth anchor.
5. Retrieval: look up the teacher-authored intervention for the
   detected misconception.
6. LLM generates a hint (not the answer) using the intervention as a
   strict template. Output must cite which `Intervention.id` it used.
7. Student attempts again. Goto 2.

Hard rules:

- The LLM **may not contradict the symbolic verifier** on arithmetic.
- The LLM **may not output the final answer** unless the student has
  made N failed attempts AND the teacher has opted into "answer
  reveal" mode for that classroom.
- Every response is logged with: detected misconception, intervention
  used, model version, prompt version. This is for eval and for trust.

Concrete deliverables:

- [ ] New route in `gpt-ai-assistant` for `/tutor` flow.
- [ ] Python microservice for math verification (FastAPI + SymPy).
      Lives at e.g. `services/math-verifier/`.
- [ ] Retrieval layer: pgvector index over `Intervention` rows.
- [ ] LLM prompt that takes (problem, student_work, detected
      misconception, teacher intervention) → student-facing hint.
- [ ] Eval harness (see §10).
- [ ] Soft launch to 1 classroom (~20 students) for 4 weeks. Daily
      teacher review of every interaction.

**Exit criterion:** Across the pilot classroom, students who use the
tool solve the *next similar problem* unaided at a rate measurably
higher than a matched control group not using it.

**Risk:** Hallucinations. Mitigation = symbolic verifier + intervention
templates + teacher review of every soft-launch interaction.

---

## 8. Phase 3 — Parent intelligence layer (Weeks 13–15)

**Goal:** The monetization layer. Weekly LINE report to parents.

Contents per report:

- Concept mastery heat map for the child.
- Predicted-collapse warnings: "Your child has not yet solidified
  fraction operations. This will likely cause failure in the algebra
  unit starting next month."
- Comparison to anonymized cohort (with care — see Risks).
- Specific recommendations: 3 practice problems, 1 video, "ask your
  child to explain X to you this week."
- Engagement metrics: tool usage, time on task.

Concrete deliverables:

- [ ] Report generator service. Runs weekly. Pulls from `StudentState`.
- [ ] LINE rich message template for the report.
- [ ] Parent settings: opt-in to specific alert types (avoid alarm
      fatigue).
- [ ] Pricing experiment: free tier (basic report) vs paid tier
      (predictions + recommendations). Run as A/B.

**Risk:** Parental anxiety overshoot. Reports must be calibrated. A
"predicted collapse" alert that fires on 30% of students is noise.
Tune to fire on <5% and only when the model is confident.

---

## 9. Phase 4 — Adaptive sequencing (Weeks 16+, open-ended)

**Prerequisite:** ≥3 months of `StudentAttempt` data, ≥500 active
students.

Build a planner that, given `StudentState`, selects the next problem
or concept to surface. Start with hand-tuned heuristics derived from
teacher rules. Move to learned policies only when there's enough data
to outperform the heuristics — probably 6+ months out.

This is also where "AI amplifying top teachers" becomes concrete:
top teachers author the sequencing rules; the system applies them to
every student.

---

## 10. Evaluation framework

This is the part most edtech projects skip. Do not skip it.

**Three levels of eval:**

1. **Component evals** (run on every PR):
   - Misconception classifier: precision/recall on held-out labeled set.
   - Symbolic verifier: 100% on a frozen test set; CI fails otherwise.
   - Retrieval: did the correct `Intervention.id` make top-3?
2. **System evals** (run weekly):
   - Frozen set of 100 real student attempts. Two rubrics:
     - **Diagnostic accuracy:** did the system identify the right
       misconception? (Graded by teacher panel against gold labels.)
     - **Intervention quality:** would the lead teacher have said
       roughly this? (1-5 rubric.)
3. **Outcome evals** (run monthly):
   - For each student: did they solve the *next* similar problem
     unaided after the intervention? Tracked over time, segmented by
     concept and by teacher cohort.
   - This is the only metric that proves the product actually teaches.

**Anti-pattern to avoid:** measuring engagement (DAU, messages sent).
Engagement goes up with addictive UX; learning outcomes don't.

---

## 11. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Student channel | LINE (existing `gpt-ai-assistant` repo) | Taiwan-native; parents/students already there. |
| API | Node.js / Express (existing) | Keep what works. |
| Pedagogy DB | Postgres | Relational graph fits; pgvector for retrieval. |
| LLM (pedagogy) | Claude Sonnet 4.6 | Strong at rubric-following and structured reasoning. |
| LLM (cheap classification / OCR) | GPT-4o-mini or Gemini Flash | Cost. |
| Math verification | Python + SymPy (FastAPI) | Symbolic ground truth. Non-negotiable. |
| Teacher dashboard | Next.js + Postgres | Fast to build; internal tool. |
| Eval harness | Custom + Anthropic eval tools | Paired-rubric on real student data. |
| Hosting | Vercel (existing) + Fly.io for Python services | Match existing deploy. |
| Observability | Structured logs → BigQuery or Postgres | Every interaction must be queryable for audit. |

**Repo layout** (extending current repo):

```
gpt-ai-assistant/
├── api/                       # existing LINE bot entry
├── app/                       # existing
├── services/
│   ├── math-verifier/         # NEW — Python FastAPI + SymPy
│   ├── tutor/                 # NEW — Node service for tutor flow
│   ├── classifier/            # NEW — misconception classifier
│   └── reporter/              # NEW — parent reports
├── db/
│   ├── migrations/            # NEW — pedagogy schema
│   └── seeds/                 # NEW — teacher-authored content
├── teacher-dashboard/         # NEW — Next.js subapp
├── evals/                     # NEW — eval harness + frozen sets
└── docs/ai-tutoring-platform/ # this spec
```

---

## 12. Team & roles

| Role | Phase 0-1 | Phase 2-3 | Notes |
|---|---|---|---|
| Lead teacher (math) | 50% time | 30% time | Owns the misconception catalog; final reviewer of all interventions. |
| Labeling teachers (2-3) | 20% each | 10% each | Inter-rater reliability matters; rotate so no single perspective dominates. |
| ML/backend engineer | 100% | 100% | Owns classifier, retrieval, schema, services. |
| Frontend engineer (part-time) | 50% | 80% | Teacher dashboard first, then parent reports. |
| Product/PM (could be founder) | — | 50% | Owns the eval rubrics and the pilot classroom relationship. |

Critical hire ordering: **lead teacher and engineer first.** Both must
be in place before Phase 0 begins. A great labeler/teacher who can also
write structured content is rarer and more valuable than the engineer.

---

## 13. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Pedagogy graph too sparse to outperform vanilla LLM | Stay in the wedge until graph density wins on evals. Resist subject expansion pressure. |
| LLM hallucinations on math | Symbolic verifier; intervention templates; teacher review during pilot. |
| Teacher labeling becomes the bottleneck | Active learning to prioritize high-signal examples; weekly cap on labeling time. |
| Parents over-trust AI predictions and harm child | Reports phrased as observations + recommended discussions, not verdicts. Hide cohort comparisons by default. |
| Student data privacy (minors) | Parental consent flow; PII separated from learning data; retention policy; consider on-prem option for schools. |
| LLM API cost per active student | Cache aggressively (problem + work hash → response); tier model use (cheap classifier, expensive only for explanation). Budget ~USD $2-5/student/month at scale. |
| LINE platform dependency | Abstract the channel layer from day one. Web client follows in Phase 5+. |
| Cheating concern from schools | Hint-only policy is provable in logs; teacher dashboard can show every interaction. Lead with this. |
| Top teacher leaves with their pedagogy | Pedagogy graph is the company's IP, authored under contract. Avoid concentration: every misconception reviewed by ≥2 teachers. |

---

## 14. Cost & timeline sketch

Headline numbers, to be refined.

- Phase 0–1 (weeks 1–6): mostly people cost. 1 eng + 0.5 teacher + 0.5
  labelers. LLM cost minimal (~USD $200/mo).
- Phase 2 (weeks 7–12): add infra. Pilot of 20 students. LLM cost
  ~USD $300/mo. Plus Python service hosting (~$50/mo).
- Phase 3 (weeks 13–15): parent layer ships. First paid tier.
- Total to "first paying parent": ~15 weeks, assuming the lead teacher
  is in place from day one.

---

## 15. Open decisions

These need answers before or during Phase 0:

1. **Lead teacher identity.** Who is it? Are they aligned on
   exclusivity / IP / time commitment?
2. **Pilot classroom.** Which class, which teacher, which 20 students?
   Need consent flow ready.
3. **Pricing model.** Per-student subscription, classroom license, or
   B2B to other cram schools? This shapes the parent layer design.
4. **Brand vs platform.** Is the goal to dominate one chain's classrooms
   (vertical) or license the platform to other schools (horizontal)?
   Both viable; they have different product implications.
5. **Data residency.** Taiwan-only? Some schools/parents will require
   it. Affects hosting choices.

---

## 16. What this spec is not

- Not a marketing deck. No claims about "revolutionizing education."
- Not a fundraising plan.
- Not a final schema — Phase 0 will revise §4.
- Not committed to ChatGPT's framing in the original conversation,
  though it agrees on the central thesis: **the moat is the encoded
  teaching expertise, not the model.**
