'use server';

import { revalidatePath } from 'next/cache';
import { pool } from '@/lib/tutor/db';
import { generateQuestions, ConceptForGeneration } from '@/lib/tutor/generate-questions';
import { getTutorUser } from '@/lib/tutor/role';

export interface GenerateResult {
  ok: boolean;
  added?: number;
  costUSD?: number;
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
