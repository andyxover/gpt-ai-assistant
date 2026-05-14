import { getTutorUser } from '@/lib/tutor/role';
import { listChildren, loadWeeklyDigest } from '@/lib/tutor/parent';
import { redirect } from 'next/navigation';

const STRINGS = {
  en: {
    title: 'Exam prediction',
    noExam: 'No upcoming assessment scheduled.',
    readiness: 'Estimated readiness',
    methodology: 'Based on this week\'s accuracy on covered concepts. Re-runs as more practice is logged.',
  },
  zh: {
    title: '考試預測',
    noExam: '近期沒有排定的評量。',
    readiness: '預估準備度',
    methodology: '根據本週於已覆蓋概念的正確率推算。隨更多練習資料更新。',
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

  return (
    <main className="max-w-3xl mx-auto p-6 sm:p-8">
      <h1 className="text-3xl font-bold mb-6">{L.title}</h1>

      {!exam ? (
        <p className="text-stone-600">{L.noExam}</p>
      ) : (
        <section className="bg-white border border-stone-200 rounded-2xl p-6">
          <p className="text-xs font-mono uppercase tracking-wide text-stone-500">{exam.name}</p>
          <p className="text-lg font-semibold mt-1">
            {exam.scope ?? '—'} · {exam.weeksAway} {lang === 'zh' ? '週後' : exam.weeksAway === 1 ? 'week away' : 'weeks away'}
          </p>

          <div className="mt-5">
            <p className="text-[11px] font-mono uppercase tracking-wide text-stone-500">{L.readiness}</p>
            <div className="flex items-center gap-3 mt-2">
              <div className="flex-1 h-3 bg-stone-100 rounded-full overflow-hidden">
                <div className={`h-full ${tierClass(data!.accuracyPercent)}`} style={{ width: `${data!.accuracyPercent}%` }} />
              </div>
              <span className="font-semibold text-stone-900 w-12 text-right">{data!.accuracyPercent}%</span>
            </div>
          </div>

          <p className="text-xs text-stone-500 mt-4">{L.methodology}</p>
        </section>
      )}
    </main>
  );
}

function tierClass(score: number) {
  if (score >= 80) return 'bg-green-500';
  if (score >= 50) return 'bg-[#c9874a]';
  if (score >= 25) return 'bg-amber-400';
  return 'bg-red-400';
}
