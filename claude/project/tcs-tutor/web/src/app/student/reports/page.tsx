import { getTutorUser } from '@/lib/tutor/role';
import { pool } from '@/lib/tutor/db';
import { redirect } from 'next/navigation';

interface MasteryRow {
  name: string;
  code: string;
  chapter_title: string | null;
  week_introduced: number;
  score: string;
  attempts_count: number;
  correct_count: number;
  last_attempt_at: string | null;
}

interface SummaryRow {
  total_attempts: string;
  correct_attempts: string;
  active_days: string;
}

export default async function LearningReportsPage() {
  const user = await getTutorUser();
  if (!user) redirect('/login');
  if (user.role !== 'student') redirect('/');

  const [{ rows: mastery }, { rows: [summary] }] = await Promise.all([
    pool.query<MasteryRow>(
      `SELECT c.name, c.code, c.chapter_title, c.week_introduced,
              m.score::text AS score, m.attempts_count, m.correct_count, m.last_attempt_at
         FROM mastery m
         JOIN concepts c ON c.id = m.concept_id
        WHERE m.student_id = $1
        ORDER BY m.score DESC, c.sequence_order`,
      [user.id],
    ),
    pool.query<SummaryRow>(
      `SELECT COUNT(*)::text AS total_attempts,
              SUM(CASE WHEN is_correct THEN 1 ELSE 0 END)::text AS correct_attempts,
              COUNT(DISTINCT DATE(created_at))::text AS active_days
         FROM attempts WHERE student_id = $1`,
      [user.id],
    ),
  ]);

  const total = Number(summary?.total_attempts ?? 0);
  const correct = Number(summary?.correct_attempts ?? 0);
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
  const days = Number(summary?.active_days ?? 0);

  return (
    <>
      <div className="eyebrow">Reports</div>
      <h1>Learning reports</h1>
      <p className="subtitle">How your practice has been going across the semester.</p>

      <div className="kpi-grid">
        <div className="kpi">
          <div className="label">Questions answered</div>
          <div className="value">{total}</div>
          <div className="sub">across {days} {days === 1 ? 'day' : 'days'}</div>
        </div>
        <div className="kpi">
          <div className="label">Accuracy</div>
          <div className="value">{accuracy}%</div>
          <div className="sub">{correct} correct of {total}</div>
        </div>
        <div className="kpi">
          <div className="label">Concepts touched</div>
          <div className="value">{mastery.length}</div>
          <div className="sub">at least one attempt</div>
        </div>
      </div>

      <div className="section-h">
        <h2>Mastery by concept</h2>
        <span className="hint">higher = stronger</span>
      </div>

      {mastery.length === 0 ? (
        <div className="empty-illust">No mastery data yet — practice some questions and check back.</div>
      ) : (
        <div className="card" style={{ padding: '6px 0' }}>
          {mastery.map(m => {
            const score = Math.round(Number(m.score));
            const tier = score >= 80 ? 'high' : score >= 50 ? 'mid' : 'low';
            const tierColor =
              tier === 'high' ? 'var(--success)' :
              tier === 'mid' ? 'var(--warn)' :
              'var(--danger)';
            return (
              <div key={m.code} style={{ padding: '12px 18px', borderBottom: '1px solid var(--border-soft)' }}>
                <div className="row" style={{ marginBottom: 6 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{m.name}</div>
                    <div className="mono small dim" style={{ marginTop: 2 }}>
                      {m.chapter_title ?? '(no chapter)'} · W{m.week_introduced}
                    </div>
                  </div>
                  <div className="spacer"></div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="mono" style={{ fontSize: 14, fontWeight: 600 }}>{score}<span className="dim">/100</span></div>
                    <div className="mono small dim" style={{ marginTop: 2 }}>{m.correct_count}/{m.attempts_count}</div>
                  </div>
                </div>
                <div style={{ height: 6, background: 'var(--border-soft)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${score}%`, background: tierColor, transition: 'width .3s ease' }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
