import { getTutorUser } from '@/lib/tutor/role';
import { listChildren, loadWeeklyDigest, type Lang } from '@/lib/tutor/parent';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import NarrativeSection from './NarrativeSection';
import NarrativeSkeleton from './NarrativeSkeleton';

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

      {/*
        The narrative is the only slow piece on this page (8-12s on a
        cache miss for the AI call). Wrapping it in <Suspense> lets the
        header + KPIs paint instantly while the narrative streams in.
        Far better UX than blocking the whole route behind it.
      */}
      <Suspense fallback={<NarrativeSkeleton />}>
        <NarrativeSection data={data} lang={lang} L={L} />
      </Suspense>

      <div className="parent-footer">
        <span className="item">{L.safetyNote}</span>
        <span className="item mono">last updated {new Date().toLocaleDateString(lang === 'zh' ? 'zh-TW' : 'en-US')}</span>
      </div>
    </>
  );
}
