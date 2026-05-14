import { getTutorUser } from '@/lib/tutor/role';
import { pool } from '@/lib/tutor/db';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import FlagActions from './FlagActions';

interface FlagRow {
  flag_id: string;
  reason: string | null;
  flagger_display: string;
  flagger_role: string;
  flagged_at: string;
  question_id: string;
  body: string;
  correct_letter: string;
  options: { letter: string; text: string }[] | string;
  explanation: string;
  concept_name: string;
  class_name: string;
  retired_at: string | null;
}

export default async function FlaggedPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const user = await getTutorUser();
  if (!user) redirect('/login');
  if (user.role !== 'teacher' && user.role !== 'admin') redirect('/');

  const sp = await searchParams;
  const showAll = sp.show === 'all';

  const { rows } = await pool.query<FlagRow>(
    `SELECT f.id AS flag_id, f.reason, f.created_at AS flagged_at,
            f.flagger_role,
            (SELECT display_name FROM users WHERE id = f.flagger_user_id) AS flagger_display,
            q.id AS question_id, q.body, q.correct_letter, q.options, q.explanation,
            q.retired_at,
            c.name AS concept_name,
            cls.display_name AS class_name
       FROM flagged_items f
       JOIN questions q  ON q.id = f.question_id
       JOIN concepts  c  ON c.id = q.concept_id
       JOIN syllabi   s  ON s.id = c.syllabus_id
       JOIN classes cls  ON cls.id = s.class_id
      WHERE cls.teacher_user_id = $1
        ${showAll ? '' : `AND f.status = 'open'`}
      ORDER BY f.created_at DESC
      LIMIT 100`,
    [user.id],
  );

  return (
    <main className="max-w-3xl mx-auto p-6 sm:p-8">
      <header className="mb-6">
        <Link href="/teacher" className="text-sm text-stone-500 hover:underline">← Back</Link>
        <div className="flex items-baseline justify-between mt-2">
          <h1 className="text-3xl font-bold">Flagged questions</h1>
          <Link
            href={showAll ? '/teacher/flagged' : '/teacher/flagged?show=all'}
            className="text-sm text-[#a86a36] hover:underline"
          >
            {showAll ? 'Show open only' : 'Show all'}
          </Link>
        </div>
      </header>

      {rows.length === 0 ? (
        <div className="bg-stone-50 border border-stone-200 rounded-2xl p-6 text-center">
          <p className="text-stone-600">
            {showAll ? 'No flags found.' : 'No open flags. 🎉'}
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {rows.map(f => {
            const options = normalizeOptions(f.options);
            return (
              <li key={f.flag_id} className="bg-white border border-stone-200 rounded-2xl p-5">
                <div className="flex items-baseline justify-between mb-2">
                  <div>
                    <p className="text-sm font-medium text-[#a86a36]">{f.concept_name}</p>
                    <p className="text-xs text-stone-500 mt-0.5">{f.class_name}</p>
                  </div>
                  <p className="text-xs text-stone-500">
                    Flagged by {f.flagger_display} ({f.flagger_role}) ·{' '}
                    {new Date(f.flagged_at).toLocaleDateString()}
                    {f.retired_at && ' · question retired'}
                  </p>
                </div>

                {f.reason && (
                  <p className="text-sm bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                    <span className="font-semibold text-amber-900">Reason: </span>
                    {f.reason}
                  </p>
                )}

                <p className="text-stone-900 mb-3 whitespace-pre-wrap">{f.body}</p>

                <ul className="space-y-1.5 mb-3">
                  {options.map(o => (
                    <li
                      key={o.letter}
                      className={`px-3 py-2 rounded-lg text-sm border ${
                        o.letter === f.correct_letter
                          ? 'border-green-200 bg-green-50'
                          : 'border-stone-100'
                      }`}
                    >
                      <span className="font-semibold mr-2">{o.letter})</span>
                      {o.text}
                      {o.letter === f.correct_letter && <span className="ml-2 text-xs text-green-700">correct</span>}
                    </li>
                  ))}
                </ul>

                {f.explanation && (
                  <p className="text-sm text-stone-600 leading-relaxed border-l-2 border-stone-200 pl-3 mb-3">
                    {f.explanation}
                  </p>
                )}

                {!showAll && <FlagActions flagId={f.flag_id} />}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

function normalizeOptions(raw: FlagRow['options']): { letter: string; text: string }[] {
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(String(raw));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
