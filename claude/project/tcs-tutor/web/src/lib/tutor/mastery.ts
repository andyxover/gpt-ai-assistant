import { pool } from './db';

export interface QuestionForStudent {
  id: string;
  concept_id: string;
  concept_name: string;
  body: string;
  options: { letter: string; text: string }[];
  difficulty: number;
}

export interface AttemptResult {
  isCorrect: boolean;
  correctLetter: string;
  explanation: string | null;
  masteryBefore: number;
  masteryAfter: number;
}

/**
 * Pick the next question for a student in a given syllabus.
 *
 * Phase-1 strategy (simpler than the full mastery engine):
 *  - Eligible concepts = those at or before current_week, not safety-critical.
 *  - Within those, prefer concepts with the lowest mastery (or zero attempts).
 *  - Within the concept, pick any approved question the student hasn't answered
 *    in the last 5 attempts (anti-repeat window).
 */
export async function pickNextQuestion(opts: {
  studentId: string;
  syllabusId: string;
}): Promise<QuestionForStudent | null> {
  // Try with anti-repeat first, then fall back to no anti-repeat if pool is too small.
  const queryFor = (windowSize: number) => pool.query<{
    qid: string; concept_id: string; concept_name: string;
    body: string; options: unknown; difficulty: number;
  }>(
    `WITH syl AS (
       SELECT id, current_week FROM syllabi WHERE id = $1
     ),
     eligible_concepts AS (
       SELECT c.id, c.name
         FROM concepts c, syl
        WHERE c.syllabus_id = syl.id
          AND c.week_introduced <= syl.current_week
          AND c.is_safety_critical = false
     ),
     recent_attempts AS (
       SELECT question_id FROM attempts
        WHERE student_id = $2
        ORDER BY created_at DESC LIMIT $3
     ),
     candidate AS (
       SELECT q.id AS qid, q.concept_id, ec.name AS concept_name,
              q.body, q.options, q.difficulty,
              COALESCE(m.score, 0) AS mastery,
              random() AS r
         FROM questions q
         JOIN eligible_concepts ec ON ec.id = q.concept_id
         LEFT JOIN mastery m
                ON m.student_id = $2 AND m.concept_id = q.concept_id
        WHERE q.validation_status = 'approved'
          AND ($3 = 0 OR q.id NOT IN (SELECT question_id FROM recent_attempts))
        ORDER BY mastery ASC, r
        LIMIT 1
     )
     SELECT qid, concept_id, concept_name, body, options, difficulty FROM candidate`,
    [opts.syllabusId, opts.studentId, windowSize],
  );

  let result = await queryFor(3);
  if (!result.rows.length) result = await queryFor(0);
  const rows = result.rows;

  if (!rows.length) return null;
  const r = rows[0];
  const options = Array.isArray(r.options)
    ? r.options as { letter: string; text: string }[]
    : (typeof r.options === 'string' ? JSON.parse(r.options) : []);
  return {
    id: r.qid,
    concept_id: r.concept_id,
    concept_name: r.concept_name,
    body: r.body,
    options,
    difficulty: r.difficulty,
  };
}

/**
 * Record an attempt and update mastery.
 *
 * Phase-1 mastery update (simple linear; the full engine uses EMA + difficulty
 * weighting):
 *   correct → +20, clamped to [0, 100]
 *   wrong   → −5,  clamped to [0, 100]
 */
export async function recordAttempt(opts: {
  studentId: string;
  questionId: string;
  letter: string;
  sessionId: string | null;
}): Promise<AttemptResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: [q] } = await client.query<{
      id: string; concept_id: string; correct_letter: string; explanation: string | null;
    }>(
      `SELECT id, concept_id, correct_letter, explanation FROM questions WHERE id = $1`,
      [opts.questionId],
    );
    if (!q) throw new Error('Question not found');

    const isCorrect = q.correct_letter === opts.letter;

    // Read current mastery (or zero if none)
    const { rows: [mRow] } = await client.query<{ score: number }>(
      `SELECT score FROM mastery
        WHERE student_id = $1 AND concept_id = $2`,
      [opts.studentId, q.concept_id],
    );
    const masteryBefore = mRow?.score != null ? Number(mRow.score) : 0;
    const delta = isCorrect ? 20 : -5;
    const masteryAfter = Math.max(0, Math.min(100, masteryBefore + delta));

    // Record attempt
    await client.query(
      `INSERT INTO attempts
        (student_id, question_id, session_id, answer_letter, is_correct)
       VALUES ($1, $2, $3, $4, $5)`,
      [opts.studentId, q.id, opts.sessionId, opts.letter, isCorrect],
    );

    // Upsert mastery row — increment counters
    await client.query(
      `INSERT INTO mastery (student_id, concept_id, score, attempts_count, correct_count, last_attempt_at, updated_at)
       VALUES ($1, $2, $3, 1, $4, now(), now())
       ON CONFLICT (student_id, concept_id) DO UPDATE
         SET score          = EXCLUDED.score,
             attempts_count = mastery.attempts_count + 1,
             correct_count  = mastery.correct_count + $4,
             last_attempt_at = now(),
             updated_at      = now()`,
      [opts.studentId, q.concept_id, masteryAfter, isCorrect ? 1 : 0],
    );

    await client.query('COMMIT');

    return {
      isCorrect,
      correctLetter: q.correct_letter,
      explanation: q.explanation,
      masteryBefore,
      masteryAfter,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Find the active syllabus for a student's enrolled class.
 */
export async function findActiveSyllabusForStudent(studentId: string): Promise<{ id: string; class_id: string } | null> {
  const { rows } = await pool.query<{ id: string; class_id: string }>(
    `SELECT s.id, s.class_id
       FROM syllabi s
       JOIN enrollments e ON e.class_id = s.class_id
      WHERE e.student_id = $1
        AND e.withdrawn_at IS NULL
        AND s.superseded_at IS NULL
      ORDER BY s.created_at DESC
      LIMIT 1`,
    [studentId],
  );
  return rows[0] ?? null;
}

/**
 * Get or create an active chat session for the student.
 */
export async function ensureSession(opts: {
  studentId: string; classId: string; mode: 'review' | 'preview' | 'exam_prep';
}): Promise<{ id: string }> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM chat_sessions
      WHERE student_id = $1 AND ended_at IS NULL
      ORDER BY started_at DESC LIMIT 1`,
    [opts.studentId],
  );
  if (rows[0]) return rows[0];

  const { rows: [created] } = await pool.query<{ id: string }>(
    `INSERT INTO chat_sessions (student_id, class_id, mode)
     VALUES ($1, $2, $3) RETURNING id`,
    [opts.studentId, opts.classId, opts.mode],
  );
  return created;
}
