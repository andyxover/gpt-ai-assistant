import { getTutorUser } from '@/lib/tutor/role';
import { listChildren, loadWeeklyDigest, generateParentNarrative, type Lang } from '@/lib/tutor/parent';
import { redirect } from 'next/navigation';

const STRINGS = {
  en: {
    weeklySummary: 'This week',
    forChild: 'For',
    questionsPracticed: 'Questions practiced',
    accuracy: 'Accuracy',
    improvement: 'What got stronger',
    attention: 'What still needs attention',
    prediction: 'Looking ahead',
    actions: 'Things you can do this week',
    nextExam: 'Next assessment',
    weeksAway: 'weeks away',
    weekAway: 'week away',
    noData: 'Not enough activity this week to write a digest yet.',
    safetyNote: 'AI-generated summary based on your child\'s practice data.',
  },
  zh: {
    weeklySummary: '本週',
    forChild: '關於',
    questionsPracticed: '本週練習題數',
    accuracy: '正確率',
    improvement: '進步的部分',
    attention: '需要加強的部分',
    prediction: '展望',
    actions: '家長本週可以做的事',
    nextExam: '下次評量',
    weeksAway: '週後',
    weekAway: '週後',
    noData: '本週活動不足,還無法生成報告。',
    safetyNote: '本報告由 AI 根據孩子的練習紀錄產生。',
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
    return (
      <main className="max-w-3xl mx-auto p-6 sm:p-8">
        <p className="text-stone-600">No children linked to this account yet.</p>
      </main>
    );
  }

  const data = await loadWeeklyDigest(activeChildId);
  if (!data) {
    return (
      <main className="max-w-3xl mx-auto p-6 sm:p-8">
        <p className="text-stone-600">Could not load data for this child.</p>
      </main>
    );
  }

  const narrative = await generateParentNarrative(data, lang);

  return (
    <main className="max-w-3xl mx-auto p-6 sm:p-8">
      <header className="mb-6">
        <p className="text-sm text-stone-500">{L.forChild} {data.child.display_name}{data.child.section ? ` · ${data.child.section}` : ''}</p>
        <h1 className="text-3xl font-bold mt-1">{L.weeklySummary}</h1>
      </header>

      <section className="grid grid-cols-2 gap-3 mb-6">
        <Stat label={L.questionsPracticed} value={String(data.totalAttempts)} />
        <Stat label={L.accuracy} value={`${data.accuracyPercent}%`} />
      </section>

      {narrative ? (
        <div className="space-y-5">
          <NarrativeCard title={L.improvement} body={narrative.improvement} tone="positive" />
          <NarrativeCard title={L.attention} body={narrative.attention} tone="warn" />
          <NarrativeCard title={L.prediction} body={narrative.prediction} tone="neutral" />
          <section>
            <h2 className="font-semibold mb-2">{L.actions}</h2>
            <ul className="space-y-2">
              {narrative.actions.map((a, i) => (
                <li key={i} className="flex gap-2 text-sm bg-white border border-stone-200 rounded-xl px-4 py-3">
                  <span className="text-[#a86a36] font-semibold shrink-0">{i + 1}.</span>
                  <span className="text-stone-700">{a}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : (
        <div className="bg-stone-50 border border-stone-200 rounded-2xl p-6 text-center text-stone-600">
          {L.noData}
        </div>
      )}

      {data.nextExam && (
        <section className="mt-6 bg-amber-50 border border-amber-200 rounded-2xl p-5">
          <p className="text-xs uppercase tracking-wide text-amber-800 font-medium">{L.nextExam}</p>
          <p className="font-medium mt-1">{data.nextExam.name}</p>
          <p className="text-sm text-stone-600 mt-0.5">
            {data.nextExam.weeksAway} {data.nextExam.weeksAway === 1 ? L.weekAway : L.weeksAway}
            {data.nextExam.scope ? ` · ${data.nextExam.scope}` : ''}
          </p>
        </section>
      )}

      <p className="text-xs text-stone-400 mt-8 text-center">{L.safetyNote}</p>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-4">
      <p className="text-[11px] font-mono uppercase tracking-wide text-stone-500">{label}</p>
      <p className="text-2xl font-semibold mt-1">{value}</p>
    </div>
  );
}

function NarrativeCard({ title, body, tone }: { title: string; body: string; tone: 'positive' | 'warn' | 'neutral' }) {
  const toneClass =
    tone === 'positive' ? 'border-green-200 bg-green-50' :
    tone === 'warn' ? 'border-amber-200 bg-amber-50' :
    'border-stone-200 bg-white';
  return (
    <section className={`border rounded-2xl p-5 ${toneClass}`}>
      <h2 className="font-semibold mb-2">{title}</h2>
      <p className="text-sm text-stone-700 leading-relaxed whitespace-pre-wrap">{body}</p>
    </section>
  );
}
