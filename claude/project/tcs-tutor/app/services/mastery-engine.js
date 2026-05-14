import { pool, query, tx } from '../lib/db.js';

// ──────────────────────────────────────────────────────────────────────────
// Tunables. Kept at the top so the algorithm is transparent and easy to
// adjust. Any change here should be A/B'd against the previous values.
// ──────────────────────────────────────────────────────────────────────────

export const MASTERY_CONFIG = {
  // EMA: new = (1 - alpha) * old + alpha * point.
  // baseAlpha tuned so ~4-5 attempts move a student from 0 to ~70 if they
  // get them all right at neutral difficulty.
  baseAlpha: 0.25,
  difficultyPivot: 3,          // difficulty 3 is the neutral weight
  alphaCap: 0.5,
  initialScore: 0,

  // Prereq gating: a hard prereq must be at least this mastery score before
  // its dependent concept can be drilled.
  prereqGateScore: 50,
  previewPrereqScore: 70,      // higher bar when previewing future content

  // Anti-repeat: don't show a question this student has attempted within
  // the last N attempts on the same concept.
  recentAvoidWindow: 3
};

// Mastery band → eligible question difficulty range.
const DIFFICULTY_BANDS = [
  { maxMastery: 30,  band: [1, 2] },
  { maxMastery: 60,  band: [2, 3] },
  { maxMastery: 85,  band: [3, 4] },
  { maxMastery: 101, band: [4, 5] }
];

// ──────────────────────────────────────────────────────────────────────────
// Pure helpers — testable in isolation, no DB.
// ──────────────────────────────────────────────────────────────────────────

/**
 * Update mastery score after a single attempt.
 * @param {number} oldScore  0-100
 * @param {boolean} isCorrect
 * @param {number} difficulty  1-5
 * @returns {number} new score, 0-100 (integer)
 */
export function computeNewMastery(oldScore, isCorrect, difficulty) {
  const point = isCorrect ? 100 : 0;
  const weight = Math.min(
    MASTERY_CONFIG.alphaCap,
    MASTERY_CONFIG.baseAlpha * (difficulty / MASTERY_CONFIG.difficultyPivot)
  );
  const next = (1 - weight) * oldScore + weight * point;
  return Math.max(0, Math.min(100, Math.round(next)));
}

/**
 * Map mastery score → eligible question difficulty range.
 * @param {number} masteryScore 0-100
 * @returns {[number, number]} inclusive [min, max], both in 1-5
 */
export function pickDifficultyBand(masteryScore) {
  for (const { maxMastery, band } of DIFFICULTY_BANDS) {
    if (masteryScore < maxMastery) return band;
  }
  return [4, 5];
}

// ──────────────────────────────────────────────────────────────────────────
// recordAttempt — transactional: insert attempt + bump question telemetry
// + upsert mastery row, atomically.
// ──────────────────────────────────────────────────────────────────────────

/**
 * Record a student's answer to a question and update mastery.
 * Wraps insert + telemetry + mastery update in one transaction.
 *
 * @param {object} args
 * @param {string} args.studentId
 * @param {string} args.questionId
 * @param {string} args.answerLetter  'A'-'D'
 * @param {string} [args.sessionId]
 * @param {number} [args.timeTakenMs]
 * @returns {Promise<{
 *   attemptId: string, isCorrect: boolean, conceptId: string,
 *   masteryBefore: number, masteryAfter: number
 * }>}
 */
export async function recordAttempt({ studentId, questionId, answerLetter, sessionId, timeTakenMs }) {
  if (!studentId || !questionId || !answerLetter) {
    throw new Error('studentId, questionId, and answerLetter are required');
  }
  if (!/^[A-D]$/.test(answerLetter)) {
    throw new Error(`answerLetter must be A-D, got "${answerLetter}"`);
  }

  return tx(async (client) => {
    const { rows: qRows } = await client.query(
      `SELECT id, concept_id, correct_letter, difficulty
         FROM questions
        WHERE id = $1 AND retired_at IS NULL`,
      [questionId]
    );
    if (qRows.length === 0) throw new Error(`Question ${questionId} not found (or retired)`);
    const q = qRows[0];

    const isCorrect = answerLetter === q.correct_letter;

    const { rows: aRows } = await client.query(
      `INSERT INTO attempts (student_id, question_id, session_id, answer_letter, is_correct, time_taken_ms)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, created_at`,
      [studentId, questionId, sessionId ?? null, answerLetter, isCorrect, timeTakenMs ?? null]
    );
    const attempt = aRows[0];

    await client.query(
      `UPDATE questions
          SET total_attempts = total_attempts + 1,
              total_correct  = total_correct + $2
        WHERE id = $1`,
      [questionId, isCorrect ? 1 : 0]
    );

    const { rows: mRows } = await client.query(
      `SELECT score FROM mastery WHERE student_id = $1 AND concept_id = $2`,
      [studentId, q.concept_id]
    );
    const masteryBefore = mRows.length ? Number(mRows[0].score) : MASTERY_CONFIG.initialScore;
    const masteryAfter = computeNewMastery(masteryBefore, isCorrect, q.difficulty);

    await client.query(
      `INSERT INTO mastery (student_id, concept_id, score, attempts_count, correct_count, last_attempt_at, updated_at)
       VALUES ($1, $2, $3, 1, $4, $5, now())
       ON CONFLICT (student_id, concept_id) DO UPDATE SET
         score = EXCLUDED.score,
         attempts_count = mastery.attempts_count + 1,
         correct_count  = mastery.correct_count + $4,
         last_attempt_at = EXCLUDED.last_attempt_at,
         updated_at = now()`,
      [studentId, q.concept_id, masteryAfter, isCorrect ? 1 : 0, attempt.created_at]
    );

    return {
      attemptId: attempt.id,
      isCorrect,
      conceptId: q.concept_id,
      masteryBefore,
      masteryAfter
    };
  });
}

// ──────────────────────────────────────────────────────────────────────────
// pickNextConcept — adaptive selector. Different modes use different
// week-range filters; all modes respect hard prerequisite gating.
// ──────────────────────────────────────────────────────────────────────────

/**
 * Pick the next concept for a student to drill.
 *
 * Algorithm:
 *   1. Filter to concepts in the syllabus whose week_introduced is in the
 *      mode-specific window relative to currentWeek.
 *   2. Drop concepts whose HARD prereqs are below the gating threshold.
 *   3. Sort by ascending mastery (weakest first), breaking ties by
 *      longest-time-since-last-attempt.
 *   4. Return the top candidate.
 *
 * Returns null if no eligible concept exists.
 *
 * @param {object} args
 * @param {string} args.studentId
 * @param {string} args.syllabusId
 * @param {'review'|'preview'|'exam_prep'} [args.mode='review']
 * @param {number} args.currentWeek
 * @param {number} [args.weeksAhead=2]  Only used by 'preview'
 */
export async function pickNextConcept({ studentId, syllabusId, mode = 'review', currentWeek, weeksAhead = 2 }) {
  if (!studentId || !syllabusId) throw new Error('studentId and syllabusId are required');
  if (!Number.isInteger(currentWeek)) throw new Error('currentWeek must be an integer');

  let weekMin, weekMax;
  if (mode === 'review' || mode === 'exam_prep') {
    weekMin = 1;
    weekMax = currentWeek;
  } else if (mode === 'preview') {
    weekMin = currentWeek + 1;
    weekMax = currentWeek + weeksAhead;
  } else {
    throw new Error(`Unknown mode: ${mode}`);
  }

  const candidates = await query(
    `SELECT c.id,
            c.code,
            c.name,
            c.week_introduced,
            c.sequence_order,
            c.is_safety_critical,
            COALESCE(m.score, $5) AS score,
            COALESCE(m.attempts_count, 0) AS attempts_count,
            m.last_attempt_at
       FROM concepts c
  LEFT JOIN mastery m
         ON m.concept_id = c.id AND m.student_id = $1
      WHERE c.syllabus_id = $2
        AND c.week_introduced BETWEEN $3 AND $4
   ORDER BY c.sequence_order`,
    [studentId, syllabusId, weekMin, weekMax, MASTERY_CONFIG.initialScore]
  );

  if (candidates.length === 0) return null;

  const minPrereqScore = mode === 'preview'
    ? MASTERY_CONFIG.previewPrereqScore
    : MASTERY_CONFIG.prereqGateScore;
  const eligible = await filterByPrereqs(candidates, studentId, minPrereqScore);
  if (eligible.length === 0) {
    return null;
  }

  eligible.sort((a, b) => {
    const sa = Number(a.score);
    const sb = Number(b.score);
    if (sa !== sb) return sa - sb;
    const ta = a.last_attempt_at ? new Date(a.last_attempt_at).getTime() : 0;
    const tb = b.last_attempt_at ? new Date(b.last_attempt_at).getTime() : 0;
    return ta - tb;
  });

  const pick = eligible[0];
  return {
    conceptId: pick.id,
    code: pick.code,
    name: pick.name,
    masteryScore: Number(pick.score),
    attemptsCount: Number(pick.attempts_count),
    reason: pickReason(pick, mode)
  };
}

function pickReason(c, mode) {
  const score = Number(c.score);
  if (mode === 'preview') return `Upcoming (week ${c.week_introduced}), not yet introduced`;
  if (score === 0 && Number(c.attempts_count) === 0) return 'Not attempted yet';
  if (score < 50) return `Weak (${score}/100) — review priority`;
  if (score < 75) return `Developing (${score}/100)`;
  return `Maintenance (${score}/100)`;
}

async function filterByPrereqs(candidates, studentId, minScore) {
  const ids = candidates.map(c => c.id);
  if (ids.length === 0) return [];

  const prereqRows = await query(
    `SELECT cp.concept_id,
            cp.strength,
            COALESCE(m.score, 0) AS prereq_score
       FROM concept_prereqs cp
  LEFT JOIN mastery m
         ON m.concept_id = cp.prereq_concept_id AND m.student_id = $1
      WHERE cp.concept_id = ANY($2::uuid[])`,
    [studentId, ids]
  );

  const blocked = new Set();
  for (const r of prereqRows) {
    if (r.strength === 'hard' && Number(r.prereq_score) < minScore) {
      blocked.add(r.concept_id);
    }
  }
  return candidates.filter(c => !blocked.has(c.id));
}

// ──────────────────────────────────────────────────────────────────────────
// pickNextQuestion — given a concept, pick the next question for a student.
// ──────────────────────────────────────────────────────────────────────────

/**
 * Pick the next question for a student on a specific concept.
 *
 * - Targets the difficulty band matching the student's current mastery.
 * - Excludes the student's most recent K attempts on this concept
 *   (anti-repeat window).
 * - Among eligible questions, picks the one the student has attempted
 *   fewest times overall (gives them new material).
 * - If no question fits the band, widens the band one step in each
 *   direction and tries once more.
 *
 * Returns null only if there is no approved, non-retired question for
 * the concept at all.
 */
export async function pickNextQuestion({ studentId, conceptId }) {
  if (!studentId || !conceptId) throw new Error('studentId and conceptId are required');

  const { rows: mRows } = await pool.query(
    `SELECT score FROM mastery WHERE student_id = $1 AND concept_id = $2`,
    [studentId, conceptId]
  );
  const mastery = mRows.length ? Number(mRows[0].score) : MASTERY_CONFIG.initialScore;
  let [diffMin, diffMax] = pickDifficultyBand(mastery);

  const recent = await query(
    `SELECT a.question_id
       FROM attempts a
       JOIN questions q ON q.id = a.question_id
      WHERE a.student_id = $1 AND q.concept_id = $2
   ORDER BY a.created_at DESC
      LIMIT $3`,
    [studentId, conceptId, MASTERY_CONFIG.recentAvoidWindow]
  );
  const recentIds = recent.map(r => r.question_id);

  let picked = await pickInBand(studentId, conceptId, diffMin, diffMax, recentIds);
  if (!picked) {
    picked = await pickInBand(
      studentId, conceptId,
      Math.max(1, diffMin - 1),
      Math.min(5, diffMax + 1),
      recentIds
    );
  }
  if (!picked) {
    picked = await pickInBand(studentId, conceptId, 1, 5, []);
  }
  return picked;
}

async function pickInBand(studentId, conceptId, diffMin, diffMax, excludeIds) {
  const rows = await query(
    `SELECT q.id,
            q.body,
            q.options,
            q.correct_letter,
            q.explanation,
            q.difficulty,
            COUNT(a.id) AS student_attempts
       FROM questions q
  LEFT JOIN attempts a
         ON a.question_id = q.id AND a.student_id = $1
      WHERE q.concept_id = $2
        AND q.validation_status = 'approved'
        AND q.retired_at IS NULL
        AND q.difficulty BETWEEN $3 AND $4
        AND q.id <> ALL($5::uuid[])
   GROUP BY q.id
   ORDER BY COUNT(a.id) ASC, RANDOM()
      LIMIT 1`,
    [studentId, conceptId, diffMin, diffMax, excludeIds]
  );
  return rows[0] ?? null;
}
