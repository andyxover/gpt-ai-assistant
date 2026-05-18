import { getTutorUser } from '@/lib/tutor/role';
import { listChildren, loadWeeklyDigest } from '@/lib/tutor/parent';
import { redirect } from 'next/navigation';

const STRINGS = {
  en: {
    eyebrow: 'Reports',
    title: 'Exam prediction',
    subtitle: 'A rough readiness estimate based on recent practice.',
    noExam: 'No upcoming assessment scheduled.',
    readiness: 'Estimated readiness',
    methodology: "Based on this week's accuracy on covered concepts. Re-runs as more practice is logged.",
    weeksAway: 'weeks away',
    weekAway: 'week away',
  },
  zh: {
    eyebrow: '報告',
    title: '考試預測',
    subtitle: '依最近練習資料估算的準備度。',
    noExam: '近期沒有排定的評量。',
    readiness: '預估準備度',
    methodology: '根據本週於已覆蓋概念的正確率推算。隨更多練習資料更新。',
    weeksAway: '週後',
    weekAway: '週後',
  },
} as const;

export default async function ExamPredictionPage({ searchParams }: { searchParams: Promise<{ child?: string }> }) {
  const user = await getTutorUser();
  if (!user) redirect('/login');
  if (user.role !== 'parent') redirect('/');

  const lang = (user.preferred_lang ?? 'en') as 'en' | 'zh';
  const L = STRINGS[lang];
  const sp = await searchParams;

  const kids = await listChildren(user.id);
  const activeChildId = sp.child ?? kids[0]?.id;
  if (!activeChildId) return null;

  const data = await loadWeeklyDigest(activeChildId);
  const exam = data?.nextExam;
  const score = data?.accuracyPercent ?? 0;

  return (
    <>
      <div className="eyebrow">{L.eyebrow}</div>
      <h1>{L.title}</h1>
      <p className="subtitle">{L.subtitle}</p>

      {!exam ? (
        <div className="empty-illust">{L.noExam}</div>
      ) : (
        <div className="prediction-card">
          <div className="row" style={{ marginBottom: 8 }}>
            <div>
              <div className="mono small dim" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>{exam.name}</div>
              <div style={{ fontSize: 17, fontWeight: 600, marginTop: 2 }}>
                {exam.scope ?? '—'} ·{' '}
                {exam.weeksAway} {exam.weeksAway === 1 ? L.weekAway : L.weeksAway}
              </div>
            </div>
            <div className="spacer"></div>
            <span className="mono" style={{ fontSize: 18, fontWeight: 600 }}>{score}%</span>
          </div>

          <div className="mono small dim" style={{ textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 10 }}>
            {L.readiness}
          </div>

          <div className="prediction-band">
            <div className="marker" style={{ left: `${Math.max(2, Math.min(98, score))}%` }} />
            <span className="tick" style={{ left: '20%' }}>at risk</span>
            <span className="tick" style={{ left: '50%' }}>borderline</span>
            <span className="tick" style={{ left: '80%' }}>on track</span>
          </div>

          <p className="mono small dim" style={{ marginTop: 28 }}>{L.methodology}</p>
        </div>
      )}
    </>
  );
}
