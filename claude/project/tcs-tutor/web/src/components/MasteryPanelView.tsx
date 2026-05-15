'use client';

export interface MasteryRow {
  concept_id: string;
  name: string;
  week_introduced: number;
  score: number;       // 0..100
  attempts: number;
}

function tier(score: number): 'low' | 'mid' | 'high' {
  if (score >= 70) return 'high';
  if (score >= 35) return 'mid';
  return 'low';
}

/**
 * Pure presentational mastery panel. Lives as a client component so
 * `PracticeClient` (and any future surface) can refresh the rows
 * without a server round-trip / full route re-render.
 */
export default function MasteryPanelView({
  concepts,
  focusConceptId,
  label = 'Mastery (this scope)',
}: {
  concepts: MasteryRow[];
  focusConceptId?: string | null;
  label?: string;
}) {
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
                <div
                  className="mastery-bar"
                  style={{ width: `${Math.max(2, c.score)}%` }}
                />
              </div>
            </div>
          );
        })
      )}
    </aside>
  );
}
