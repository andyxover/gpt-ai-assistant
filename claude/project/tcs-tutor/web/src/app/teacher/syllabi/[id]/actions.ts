'use server';

import { revalidatePath } from 'next/cache';
import { pool } from '@/lib/tutor/db';
import { generateQuestions, ConceptForGeneration } from '@/lib/tutor/generate-questions';
import { parseSyllabus, ParsedScope } from '@/lib/tutor/parse-syllabus';
import { getTutorUser } from '@/lib/tutor/role';

export interface GenerateResult {
  ok: boolean;
  added?: number;
  costUSD?: number;
  error?: string;
}

export interface ClarifyResult {
  ok: boolean;
  conceptCount?: number;
  remainingUncertainties?: string[];
  error?: string;
}

const COST_PER_M = { input: 3.0, output: 15.0 };

export async function generateForConcept(opts: {
  conceptId: string;
  syllabusId: string;
  count?: number;
}): Promise<GenerateResult> {
  const user = await getTutorUser();
  if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
    return { ok: false, error: 'Not authorized' };
  }

  // Verify the teacher owns the class for this syllabus + load the concept
  const { rows: [concept] } = await pool.query<ConceptForGeneration & {
    syllabus_owner_id: string;
  }>(
    `SELECT c.id, c.name, c.description, c.chapter_title, c.is_safety_critical,
            cls.grade, cls.teacher_user_id AS syllabus_owner_id
       FROM concepts c
       JOIN syllabi s ON s.id = c.syllabus_id
       JOIN classes cls ON cls.id = s.class_id
      WHERE c.id = $1 AND s.id = $2`,
    [opts.conceptId, opts.syllabusId],
  );
  if (!concept) return { ok: false, error: 'Concept not found' };
  if (concept.syllabus_owner_id !== user.id && user.role !== 'admin') {
    return { ok: false, error: 'You do not own this class' };
  }
  if (concept.is_safety_critical) {
    return { ok: false, error: 'Safety-critical concepts must be teacher-authored.' };
  }

  // Pull existing stems so the generator can differentiate
  const { rows: existing } = await pool.query<{ body: string }>(
    `SELECT body FROM questions WHERE concept_id = $1 ORDER BY created_at DESC LIMIT 10`,
    [opts.conceptId],
  );
  const priorStems = existing.map(r => r.body.split(/\n/)[0].slice(0, 120));

  // Generate
  let gen;
  try {
    gen = await generateQuestions(
      {
        id: concept.id,
        name: concept.name,
        description: concept.description,
        chapter_title: concept.chapter_title,
        grade: concept.grade ?? 7,
        is_safety_critical: false,
      },
      { count: opts.count ?? 5, difficulty_range: [1, 4], avoid_similar_to: priorStems },
    );
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  // Persist — schema-validated questions go in as 'approved' for Phase 2.
  // The full multi-pass validator (cross-model + fact-anchor) can be layered
  // in later; for now schema validation alone is the bar.
  let added = 0;
  for (const q of gen.questions) {
    await pool.query(
      `INSERT INTO questions
        (concept_id, body, options, correct_letter, explanation, difficulty,
         source, generator_model, generator_prompt_hash,
         validation_status, validation_score, approved_at, approved_by)
       VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9, 'approved', 1.0, now(), 'pipeline')`,
      [
        opts.conceptId,
        q.body,
        JSON.stringify(q.options),
        q.correct_letter,
        q.explanation,
        q.difficulty,
        q.source,
        q.generator_model,
        q.generator_prompt_hash,
      ],
    );
    added += 1;
  }

  const costUSD =
    (gen.usage.input_tokens * COST_PER_M.input + gen.usage.output_tokens * COST_PER_M.output) / 1_000_000;

  revalidatePath(`/teacher/syllabi/${opts.syllabusId}`);
  return { ok: true, added, costUSD };
}

// ──────────────────────────────────────────────────────────────────────────
// Clarify uncertainties → re-parse the syllabus with teacher's answers
// ──────────────────────────────────────────────────────────────────────────

export async function clarifySyllabus(opts: {
  syllabusId: string;
  /** Map of uncertainty index → teacher's answer (empty answers ignored) */
  answers: Record<number, string>;
}): Promise<ClarifyResult> {
  const user = await getTutorUser();
  if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
    return { ok: false, error: 'Not authorized' };
  }

  // Load syllabus, verify ownership, pull current raw text + uncertainties
  const { rows: [syl] } = await pool.query<{
    id: string;
    class_id: string;
    raw_text: string;
    parser_uncertainties: string[] | null;
    teacher_user_id: string;
  }>(
    `SELECT s.id, s.class_id, s.raw_text, s.parser_uncertainties,
            c.teacher_user_id
       FROM syllabi s
       JOIN classes c ON c.id = s.class_id
      WHERE s.id = $1`,
    [opts.syllabusId],
  );
  if (!syl) return { ok: false, error: 'Syllabus not found' };
  if (syl.teacher_user_id !== user.id && user.role !== 'admin') {
    return { ok: false, error: 'You do not own this class' };
  }

  const uncertainties = Array.isArray(syl.parser_uncertainties) ? syl.parser_uncertainties : [];
  if (uncertainties.length === 0) {
    return { ok: false, error: 'Nothing to clarify — no uncertainties on this syllabus.' };
  }

  // Build a "clarifications" block that pairs each flagged uncertainty with
  // the teacher's answer, then ask Claude to re-parse with those in mind.
  const qa = uncertainties
    .map((q, i) => {
      const a = (opts.answers[i] ?? '').trim();
      return a ? { q, a } : null;
    })
    .filter((x): x is { q: string; a: string } => x !== null);

  if (qa.length === 0) {
    return { ok: false, error: 'Type at least one answer before saving.' };
  }

  const augmentedText =
    syl.raw_text +
    '\n\n---\n' +
    'TEACHER CLARIFICATIONS — apply these to resolve previously-flagged uncertainties.\n' +
    'Treat the teacher\'s answer as authoritative; update the structured scope so the uncertainty no longer applies.\n\n' +
    qa.map(({ q, a }) => `Question: ${q}\nTeacher's answer: ${a}`).join('\n\n');

  // Re-parse
  let parsed: { scope: ParsedScope };
  try {
    parsed = await parseSyllabus(augmentedText);
  } catch (err) {
    return { ok: false, error: `Re-parse failed: ${err instanceof Error ? err.message : String(err)}` };
  }

  // Persist: update parsed_scope + parser_uncertainties on the same row,
  // and merge new concepts (keep existing ones with matching codes so any
  // questions already generated stay attached).
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE syllabi
          SET parsed_scope = $2::jsonb,
              parser_uncertainties = $3::jsonb
        WHERE id = $1`,
      [
        opts.syllabusId,
        JSON.stringify(parsed.scope),
        JSON.stringify(parsed.scope._uncertainties ?? []),
      ],
    );

    const concepts = flattenConcepts(parsed.scope);
    for (const c of concepts) {
      await client.query(
        `INSERT INTO concepts
           (syllabus_id, code, name, chapter_title, week_introduced, week_last_taught, sequence_order, is_safety_critical)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (syllabus_id, code) DO UPDATE
           SET name = EXCLUDED.name,
               chapter_title = EXCLUDED.chapter_title,
               week_introduced = EXCLUDED.week_introduced,
               week_last_taught = EXCLUDED.week_last_taught,
               sequence_order = EXCLUDED.sequence_order,
               is_safety_critical = EXCLUDED.is_safety_critical`,
        [opts.syllabusId, c.code, c.name, c.chapterTitle, c.weekIntroduced, c.weekLastTaught, c.sequenceOrder, c.isSafetyCritical],
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return { ok: false, error: `Save failed: ${err instanceof Error ? err.message : String(err)}` };
  } finally {
    client.release();
  }

  revalidatePath(`/teacher/syllabi/${opts.syllabusId}`);
  revalidatePath(`/teacher/classes/${syl.class_id}/progress`);
  return {
    ok: true,
    conceptCount: countConcepts(parsed.scope),
    remainingUncertainties: parsed.scope._uncertainties ?? [],
  };
}

function flattenConcepts(scope: ParsedScope) {
  const out: {
    code: string; name: string; chapterTitle: string;
    weekIntroduced: number; weekLastTaught: number;
    sequenceOrder: number; isSafetyCritical: boolean;
  }[] = [];
  let order = 0;
  for (const ch of scope.chapters ?? []) {
    for (const w of ch.weeks ?? []) {
      const weekNum = parseWeek(w.wk);
      for (const c of w.concepts ?? []) {
        order += 1;
        out.push({
          code: c.code,
          name: c.name,
          chapterTitle: ch.title,
          weekIntroduced: weekNum,
          weekLastTaught: weekNum,
          sequenceOrder: order,
          isSafetyCritical: Boolean(c.is_safety_critical),
        });
      }
    }
  }
  return out;
}

function countConcepts(scope: ParsedScope): number {
  return (scope.chapters ?? []).reduce(
    (s, ch) => s + (ch.weeks ?? []).reduce((ws, w) => ws + (w.concepts ?? []).length, 0),
    0,
  );
}

function parseWeek(wk: string): number {
  const m = String(wk).match(/(\d+)/);
  return m ? Number(m[1]) : 1;
}
