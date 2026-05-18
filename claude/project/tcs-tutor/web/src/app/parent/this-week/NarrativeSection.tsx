import {
  generateParentNarrative,
  loadImprovedConceptTrails,
  type WeeklyDigestData,
  type Lang,
} from '@/lib/tutor/parent';
import Sparkline from '@/components/Sparkline';

interface Strings {
  improvement: string;
  attention: string;
  prediction: string;
  actions: string;
  weeksAway: string;
  weekAway: string;
  noData: string;
}

/**
 * Async server component that does the slow AI call. Lives inside a
 * <Suspense> so the parent page header + KPIs paint immediately and
 * this section streams in once the narrative resolves (or returns
 * instantly from the parent_reports snapshot cache).
 */
export default async function NarrativeSection({
  data,
  lang,
  L,
}: {
  data: WeeklyDigestData;
  lang: Lang;
  L: Strings;
}) {
  const narrative = await generateParentNarrative(data, lang);
  const weakest = data.strugglingConcepts[0];

  if (!narrative) {
    return <div className="empty-illust">{L.noData}</div>;
  }

  // Pull per-concept trails for the concepts the AI flagged as improving.
  // Cheap query — handful of attempts arrays for a few concepts.
  const trails = await loadImprovedConceptTrails(
    data.child.id,
    data.improvedConcepts.map(c => c.name),
  );

  return (
    <>
      {narrative.improvement && (
        <>
          <div className="section-h"><h2>{L.improvement}</h2></div>
          <div className="card" style={{ borderLeft: '3px solid var(--success)' }}>
            <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{narrative.improvement}</p>
            {trails.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  marginTop: 14,
                  paddingTop: 12,
                  borderTop: '1px solid var(--surface-3)',
                }}
              >
                {trails.map(t => (
                  <div
                    key={t.name}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      fontSize: 13,
                    }}
                  >
                    <span style={{ flex: 1, color: 'var(--text)' }}>{t.name}</span>
                    <Sparkline points={t.points} />
                    <span
                      className="mono small"
                      style={{
                        minWidth: 56,
                        textAlign: 'right',
                        color: t.delta >= 0 ? 'var(--success)' : 'var(--danger)',
                        fontWeight: 600,
                      }}
                    >
                      {t.delta >= 0 ? '+' : ''}
                      {t.delta} · {t.scoreNow}/100
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {narrative.attention && (
        <>
          <div className="section-h"><h2>{L.attention}</h2></div>
          <div className="attention-card">
            <div className="label">Focus area</div>
            {weakest && (
              <div className="head">
                <div className="concept">{weakest.name}</div>
                <div className="meta">{weakest.score}/100 · {weakest.attempts} attempts</div>
              </div>
            )}
            <div className="body">{narrative.attention}</div>
          </div>
        </>
      )}

      {narrative.prediction && (
        <>
          <div className="section-h"><h2>{L.prediction}</h2></div>
          <div className="prediction-card">
            <p style={{ margin: '0 0 10px', fontSize: 14 }}>{narrative.prediction}</p>
            {data.nextExam && (
              <div className="prediction-band">
                <div className="marker" style={{ left: `${Math.max(2, Math.min(98, data.accuracyPercent))}%` }} />
                <span className="tick" style={{ left: '20%' }}>at risk</span>
                <span className="tick" style={{ left: '50%' }}>borderline</span>
                <span className="tick" style={{ left: '80%' }}>on track</span>
              </div>
            )}
            {data.nextExam && (
              <p className="mono small muted" style={{ marginTop: 24 }}>
                {data.nextExam.name} · {data.nextExam.weeksAway} {data.nextExam.weeksAway === 1 ? L.weekAway : L.weeksAway}
                {data.nextExam.scope ? ` · ${data.nextExam.scope}` : ''}
              </p>
            )}
          </div>
        </>
      )}

      {narrative.actions && narrative.actions.length > 0 && (
        <>
          <div className="section-h"><h2>{L.actions}</h2></div>
          <div className="action-list">
            {narrative.actions.map((a, i) => (
              <div key={i} className="action-item">
                <div className="action-num">{i + 1}</div>
                <div className="action-body">
                  <div className="title">{a}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
