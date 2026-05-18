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
    <main className="main">
      <div style={{ marginBottom: 12 }}>
        <Link href="/teacher" className="mono small dim" style={{ textDecoration: 'underline' }}>← Teacher home</Link>
      </div>
      <div className="row">
        <div>
          <div className="eyebrow">Quality</div>
          <h1>Flagged questions</h1>
        </div>
        <div className="spacer"></div>
        <Link
          href={showAll ? '/teacher/flagged' : '/teacher/flagged?show=all'}
          className="btn ghost small"
        >
          {showAll ? 'Show open only' : 'Show all'}
        </Link>
      </div>
      <p className="subtitle">Review items students marked as confusing or wrong. Keep them, or retire and stop serving them.</p>

      {rows.length === 0 ? (
        <div className="empty-illust">
          {showAll ? 'No flags found.' : 'No open flags. 🎉'}
        </div>
      ) : (
        rows.map(f => {
          const options = normalizeOptions(f.options);
          return (
            <div key={f.flag_id} className="card">
              <div className="row" style={{ marginBottom: 8 }}>
                <div>
                  <div className="eyebrow" style={{ margin: 0 }}>{f.concept_name}</div>
                  <div className="mono small dim" style={{ marginTop: 4 }}>{f.class_name}</div>
                </div>
                <div className="spacer"></div>
                <div className="mono small dim" style={{ textAlign: 'right' }}>
                  Flagged by {f.flagger_display} ({f.flagger_role})<br />
                  {new Date(f.flagged_at).toLocaleDateString()}
                  {f.retired_at && ' · retired'}
                </div>
              </div>

              {f.reason && (
                <div className="attention-card" style={{ marginBottom: 12, padding: '10px 12px' }}>
                  <div className="label">Reason</div>
                  <div className="body" style={{ marginTop: 4 }}>{f.reason}</div>
                </div>
              )}

              <p style={{ margin: '8px 0 12px', whiteSpace: 'pre-wrap' }}>{f.body}</p>

              <div className="quiz" style={{ marginTop: 0 }}>
                {options.map(o => (
                  <div
                    key={o.letter}
                    className={`opt ${o.letter === f.correct_letter ? 'correct' : ''}`}
                  >
                    <span className="letter">{o.letter}</span>
                    <span style={{ flex: 1 }}>{o.text}</span>
                    {o.letter === f.correct_letter && <span className="mono small">correct</span>}
                  </div>
                ))}
              </div>

              {f.explanation && (
                <p className="muted small" style={{ marginTop: 12, paddingLeft: 12, borderLeft: '2px solid var(--border)' }}>
                  {f.explanation}
                </p>
              )}

              {!showAll && (
                <div style={{ marginTop: 12 }}>
                  <FlagActions flagId={f.flag_id} />
                </div>
              )}
            </div>
          );
        })
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
