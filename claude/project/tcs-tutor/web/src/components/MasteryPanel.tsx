import { pool } from '@/lib/tutor/db';

interface ConceptMastery {
  concept_id: string;
  name: string;
  week_introduced: number;
  score: number;       // 0..100
  attempts: number;
}

/**
 * Load mastery rows for the concepts in scope (current week + a small
 * look-ahead) for one student. Returns concepts with no attempts as
 * score=0 so the bar is visible.
 */
async function loadMasteryForScope(opts: {
  studentId: string;
  syllabusId: string;
  currentWeek: number;
}): Promise<ConceptMastery[]> {
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

function tier(score: number): 'low' | 'mid' | 'high' {
  if (score >= 70) return 'high';
  if (score >= 35) return 'mid';
  return 'low';
}

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
  const concepts = await loadMasteryForScope({ studentId, syllabusId, currentWeek });

  const totalAttempts = concepts.reduce((s, c) => s + c.attempts, 0);
  const avgScore =
    concepts.length > 0
      ? Math.round(concepts.reduce((s, c) => s + c.score, 0) / concepts.length)
      : 0;
  const focusConcept = focusConceptId
    ? concepts.find(c => c.concept_id === focusConceptId)
    : null;

  return (
    <aside className="mastery-panel">
      <div className="mastery-header">{label}</div>
      <div className="mastery-summary">
        {totalAttempts === 0 ? (
          'Start practicing — the AI will focus on whichever concept you need most.'
        ) : (
          <>
            Avg <strong>{avgScore}/100</strong> across {concepts.length} concepts.
            {focusConcept && (
              <>
                {' '}Now focusing on <span className="focus-name">{focusConcept.name}</span>.
              </>
            )}
          </>
        )}
      </div>

      {concepts.length === 0 ? (
        <div className="muted small">No concepts in this week&apos;s scope.</div>
      ) : (
        concepts.map(c => {
          const t = tier(c.score);
          const isFocus = c.concept_id === focusConceptId;
          return (
            <div key={c.concept_id} className={`mastery-row ${t}${isFocus ? ' focus' : ''}`}>
              <div className="mastery-label">
                <span className="name">{c.name}</span>
                <span className="pct">{Math.round(c.score)}%</span>
              </div>
              <div className="mastery-bar-bg">
                <div className="mastery-bar" style={{ width: `${Math.max(2, c.score)}%` }} />
              </div>
            </div>
          );
        })
      )}
    </aside>
  );
}
