import { pool } from '@/lib/tutor/db';
import MasteryPanelView, { type MasteryRow } from './MasteryPanelView';

/**
 * Load mastery rows for the concepts in scope (current week + a small
 * look-ahead) for one student. Returns concepts with no attempts as
 * score=0 so the bar is visible.
 *
 * Exported so server pages can pre-fetch initial rows and hand them
 * straight to the client view (avoiding a second round-trip on hydrate).
 */
export async function loadMasteryRows(opts: {
  studentId: string;
  syllabusId: string;
  currentWeek: number;
}): Promise<MasteryRow[]> {
  const { rows } = await pool.query<{
    concept_id: string; name: string; week_introduced: number;
    score: string | null; attempts: string | null;
  }>(
    `SELECT c.id AS concept_id,
            c.name,
            c.week_introduced,
            m.score::text AS score,
            m.attempts_count::text AS attempts
       FROM concepts c
       LEFT JOIN mastery m
              ON m.concept_id = c.id AND m.student_id = $2
      WHERE c.syllabus_id = $1
        AND c.week_introduced <= $3 + 1
        AND c.week_introduced >= $3 - 1
        AND c.is_safety_critical = false
      ORDER BY c.week_introduced ASC, c.sequence_order ASC
      LIMIT 12`,
    [opts.syllabusId, opts.studentId, opts.currentWeek],
  );
  return rows.map(r => ({
    concept_id: r.concept_id,
    name: r.name,
    week_introduced: r.week_introduced,
    score: r.score != null ? Number(r.score) : 0,
    attempts: r.attempts != null ? Number(r.attempts) : 0,
  }));
}

/**
 * Server wrapper for surfaces that don't need client-side refresh
 * (e.g. the student dashboard "This week" overview). Pages that DO
 * need to refresh after each interaction (Practice) should fetch
 * `loadMasteryRows` themselves and render `<MasteryPanelView>` inside
 * a client wrapper that owns state.
 */
export default async function MasteryPanel({
  studentId,
  syllabusId,
  currentWeek,
  focusConceptId,
  label = 'Mastery (this scope)',
}: {
  studentId: string;
  syllabusId: string;
  currentWeek: number;
  focusConceptId?: string | null;
  label?: string;
}) {
  const concepts = await loadMasteryRows({ studentId, syllabusId, currentWeek });
  return (
    <MasteryPanelView
      concepts={concepts}
      focusConceptId={focusConceptId}
      label={label}
    />
  );
}
