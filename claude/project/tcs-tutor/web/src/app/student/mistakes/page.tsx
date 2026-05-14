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
    <>
      <div className="eyebrow">Review</div>
      <h1>Mistake log</h1>
      <p className="subtitle">Every question you didn&apos;t quite get — review them so they stick.</p>

      {rows.length === 0 ? (
        <div className="empty-illust">No mistakes logged yet — go practice and see what trips you up.</div>
      ) : (
        rows.map(m => {
          const options = normalizeOptions(m.options);
          const wrongPick = options.find(o => o.letter === m.answer_letter);
          const correctPick = options.find(o => o.letter === m.correct_letter);
          return (
            <div key={m.attempt_id} className="card">
              <div className="row" style={{ marginBottom: 6 }}>
                <div className="eyebrow" style={{ margin: 0 }}>{m.concept_name}</div>
                <div className="spacer"></div>
                <span className="mono small dim">{new Date(m.created_at).toLocaleString()}</span>
              </div>
              <p style={{ margin: '8px 0 14px', whiteSpace: 'pre-wrap' }}>{m.body}</p>

              <div className="quiz" style={{ marginTop: 0 }}>
                {wrongPick && (
                  <div className="opt wrong">
                    <span className="letter">{m.answer_letter}</span>
                    <span style={{ flex: 1 }}>{wrongPick.text}</span>
                    <span className="mono small">you picked</span>
                  </div>
                )}
                {correctPick && (
                  <div className="opt correct">
                    <span className="letter">{m.correct_letter}</span>
                    <span style={{ flex: 1 }}>{correctPick.text}</span>
                    <span className="mono small">correct</span>
                  </div>
                )}
                {m.explanation && (
                  <div className="feedback ok" style={{ background: 'var(--surface-2)', color: 'var(--text)', borderLeft: '3px solid var(--accent)' }}>
                    {m.explanation}
                  </div>
                )}
              </div>
            </div>
          );
        })
      )}
    </>
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
