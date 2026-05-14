import { getTutorUser } from '@/lib/tutor/role';
import { listChildren, loadWeeklyDigest, generateParentNarrative, type Lang } from '@/lib/tutor/parent';
import { redirect } from 'next/navigation';

const STRINGS = {
  en: {
    eyebrow: 'This week',
    questionsPracticed: 'Questions practiced',
    accuracy: 'Accuracy',
    weakestConcept: 'Weakest concept',
    improvement: 'What got stronger',
    attention: 'What still needs attention',
    prediction: 'Looking ahead',
    actions: 'Things you can do this week',
    nextExam: 'Next assessment',
    weeksAway: 'weeks away',
    weekAway: 'week away',
    noData: 'Not enough activity this week to write a digest yet.',
    safetyNote: 'AI-generated summary based on your child\'s practice data.',
    noChildren: 'No children linked to this account yet.',
  },
  zh: {
    eyebrow: '本週',
    questionsPracticed: '練習題數',
    accuracy: '正確率',
    weakestConcept: '最弱概念',
    improvement: '進步的部分',
    attention: '需要加強的部分',
    prediction: '展望',
    actions: '家長本週可以做的事',
    nextExam: '下次評量',
    weeksAway: '週後',
    weekAway: '週後',
    noData: '本週活動不足,還無法生成報告。',
    safetyNote: '本報告由 AI 根據孩子的練習紀錄產生。',
    noChildren: '此帳號尚未連結孩子。',
  },
} as const;

export default async function ThisWeekPage({ searchParams }: { searchParams: Promise<{ child?: string }> }) {
  const user = await getTutorUser();
  if (!user) redirect('/login');
  if (user.role !== 'parent') redirect('/');

  const lang: Lang = (user.preferred_lang ?? 'en') as Lang;
  const L = STRINGS[lang];
  const sp = await searchParams;

  const kids = await listChildren(user.id);
  const activeChildId = sp.child ?? kids[0]?.id;
  if (!activeChildId) {
    return <p className="muted">{L.noChildren}</p>;
  }

  const data = await loadWeeklyDigest(activeChildId);
  if (!data) return <p className="muted">{L.noChildren}</p>;

  const narrative = await generateParentNarrative(data, lang);
  const weakest = data.strugglingConcepts[0];

  return (
    <>
      <div className="report-header">
        <div className="eyebrow">{L.eyebrow}</div>
        <h1>{data.child.display_name}</h1>
        <p className="lede">
          {data.child.className ?? ''}
          {data.child.section ? ` · ${data.child.section}` : ''}
        </p>
      </div>

      <div className="kpi-grid">
        <div className="kpi">
          <div className="label">{L.questionsPracticed}</div>
          <div className="value">{data.totalAttempts}</div>
          <div className="sub">last 7 days</div>
        </div>
        <div className="kpi">
          <div className="label">{L.accuracy}</div>
          <div className="value">{data.accuracyPercent}%</div>
          <div className={`sub ${data.accuracyPercent >= 60 ? 'up' : 'down'}`}>
            {data.accuracyPercent >= 60 ? 'on track' : 'needs work'}
          </div>
        </div>
        <div className="kpi">
          <div className="label">{L.weakestConcept}</div>
          <div className="value" style={{ fontSize: 18 }}>{weakest?.name ?? '—'}</div>
          <div className="sub">{weakest ? `${weakest.score}/100` : 'no data'}</div>
        </div>
      </div>

      {narrative ? (
        <>
          {narrative.improvement && (
            <>
              <div className="section-h"><h2>{L.improvement}</h2></div>
              <div className="card" style={{ borderLeft: '3px solid var(--success)' }}>
                <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{narrative.improvement}</p>
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
      ) : (
        <div className="empty-illust">{L.noData}</div>
      )}

      <div className="parent-footer">
        <span className="item">{L.safetyNote}</span>
        <span className="item mono">last updated {new Date().toLocaleDateString(lang === 'zh' ? 'zh-TW' : 'en-US')}</span>
      </div>
    </>
  );
}
