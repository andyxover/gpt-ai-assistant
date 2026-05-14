import { getTutorUser } from '@/lib/tutor/role';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { startSession } from './actions';
import PracticeClient from './PracticeClient';

type Mode = 'review' | 'preview' | 'exam_prep';

const MODE_LABELS: Record<Mode, string> = {
  review: 'Review',
  preview: 'Preview',
  exam_prep: 'Exam prep',
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
    <main className="max-w-2xl mx-auto p-6 sm:p-8">
      <header className="mb-6 flex items-baseline justify-between">
        <div>
          <Link href="/student" className="text-sm text-stone-500 hover:underline">← Modes</Link>
          <h1 className="text-2xl font-bold mt-1">{MODE_LABELS[mode]}</h1>
        </div>
        <p className="text-sm text-stone-500">{user.display_name}</p>
      </header>

      {!session.ok ? (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6">
          <p className="text-stone-700">{session.error}</p>
          <Link href="/student" className="inline-block mt-4 text-sm text-[#a86a36] hover:underline">
            ← Back to modes
          </Link>
        </div>
      ) : (
        <PracticeClient
          initialQuestion={session.question ?? null}
          sessionId={session.sessionId ?? ''}
          initialError={session.error}
        />
      )}
    </main>
  );
}
