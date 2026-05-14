import { getTutorUser } from '@/lib/tutor/role';
import { redirect } from 'next/navigation';
import { startSession } from './actions';
import PracticeClient from './PracticeClient';

type Mode = 'review' | 'preview' | 'exam_prep';

const MODE_LABELS: Record<Mode, string> = {
  review: 'Review',
  preview: 'Preview',
  exam_prep: 'Exam prep',
};

const MODE_BLURBS: Record<Mode, string> = {
  review: 'Practicing concepts you\'ve already covered. The mastery engine picks what you need most.',
  preview: 'Looking ahead at upcoming material.',
  exam_prep: 'Targeted practice before a test.',
};

export default async function PracticePage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const user = await getTutorUser();
  if (!user) redirect('/login');
  if (user.role !== 'student') redirect('/');

  const params = await searchParams;
  const raw = (params.mode ?? 'review') as Mode;
  const mode: Mode = (['review', 'preview', 'exam_prep'] as const).includes(raw) ? raw : 'review';

  const session = await startSession(mode);

  return (
    <>
      <div className="eyebrow">Practice · {MODE_LABELS[mode]}</div>
      <h1>{MODE_LABELS[mode]}</h1>
      <p className="subtitle">{MODE_BLURBS[mode]}</p>

      {!session.ok ? (
        <div className="card">
          <div className="card-title">Can&apos;t start a session</div>
          <div className="card-desc">{session.error}</div>
          <a href="/student" className="btn secondary small" style={{ marginTop: 12 }}>← Back</a>
        </div>
      ) : (
        <PracticeClient
          initialQuestion={session.question ?? null}
          sessionId={session.sessionId ?? ''}
          initialError={session.error}
        />
      )}
    </>
  );
}
