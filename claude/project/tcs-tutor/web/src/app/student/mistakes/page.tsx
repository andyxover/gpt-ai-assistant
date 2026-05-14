import { getTutorUser } from '@/lib/tutor/role';
import { pool } from '@/lib/tutor/db';
import { redirect } from 'next/navigation';

interface MistakeRow {
  attempt_id: string;
  created_at: string;
  answer_letter: string;
  qid: string;
  body: string;
  options: { letter: string; text: string }[] | string;
  correct_letter: string;
  explanation: string;
  concept_name: string;
}

export default async function MistakeLogPage() {
  const user = await getTutorUser();
  if (!user) redirect('/login');
  if (user.role !== 'student') redirect('/');

  const { rows } = await pool.query<MistakeRow>(
    `SELECT a.id AS attempt_id, a.created_at, a.answer_letter,
            q.id AS qid, q.body, q.options, q.correct_letter, q.explanation,
            c.name AS concept_name
       FROM attempts a
       JOIN questions q ON q.id = a.question_id
       JOIN concepts  c ON c.id = q.concept_id
      WHERE a.student_id = $1 AND a.is_correct = false
      ORDER BY a.created_at DESC
      LIMIT 50`,
    [user.id],
  );

  return (
    <main className="max-w-3xl mx-auto p-6 sm:p-8">
      <header className="mb-6">
        <h1 className="text-3xl font-bold">Mistake log</h1>
        <p className="text-stone-600 mt-1">Every question you didn&apos;t quite get — review them so they stick.</p>
      </header>

      {rows.length === 0 ? (
        <div className="bg-stone-50 border border-stone-200 rounded-2xl p-6 text-center">
          <p className="text-stone-600">No mistakes logged yet — go practice and see what trips you up.</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {rows.map(m => {
            const options = normalizeOptions(m.options);
            const wrongPick = options.find(o => o.letter === m.answer_letter);
            const correctPick = options.find(o => o.letter === m.correct_letter);
            return (
              <li key={m.attempt_id} className="bg-white border border-stone-200 rounded-2xl p-5">
                <div className="flex items-baseline justify-between mb-2">
                  <p className="text-sm font-medium text-[#a86a36]">{m.concept_name}</p>
                  <p className="text-xs text-stone-500">{new Date(m.created_at).toLocaleString()}</p>
                </div>
                <p className="text-stone-900 mb-3 whitespace-pre-wrap">{m.body}</p>

                <div className="space-y-2 mb-3">
                  {wrongPick && (
                    <div className="px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-sm">
                      <span className="font-semibold mr-2 text-red-700">You picked {m.answer_letter})</span>
                      {wrongPick.text}
                    </div>
                  )}
                  {correctPick && (
                    <div className="px-3 py-2 rounded-lg border border-green-200 bg-green-50 text-sm">
                      <span className="font-semibold mr-2 text-green-700">Correct: {m.correct_letter})</span>
                      {correctPick.text}
                    </div>
                  )}
                </div>

                {m.explanation && (
                  <p className="text-sm text-stone-700 leading-relaxed border-l-2 border-stone-200 pl-3">
                    {m.explanation}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

function normalizeOptions(raw: MistakeRow['options']): { letter: string; text: string }[] {
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(String(raw));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
