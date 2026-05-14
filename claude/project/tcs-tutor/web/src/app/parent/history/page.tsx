import { getTutorUser } from '@/lib/tutor/role';
import { listChildren } from '@/lib/tutor/parent';
import { pool } from '@/lib/tutor/db';
import { redirect } from 'next/navigation';

interface HistoryRow {
  week: string;
  total: string;
  correct: string;
}

const STRINGS = {
  en: {
    eyebrow: 'Reports',
    title: 'Learning history',
    subtitle: 'Practice volume and accuracy by week.',
    empty: 'No practice history yet.',
    col_week: 'Week of',
    col_questions: 'Questions',
    col_accuracy: 'Accuracy',
  },
  zh: {
    eyebrow: '報告',
    title: '學習歷程',
    subtitle: '依週次顯示練習量與正確率。',
    empty: '尚無練習紀錄。',
    col_week: '週次',
    col_questions: '題數',
    col_accuracy: '正確率',
  },
} as const;

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ child?: string }> }) {
  const user = await getTutorUser();
  if (!user) redirect('/login');
  if (user.role !== 'parent') redirect('/');

  const lang = (user.preferred_lang ?? 'en') as 'en' | 'zh';
  const L = STRINGS[lang];
  const sp = await searchParams;

  const kids = await listChildren(user.id);
  const activeChildId = sp.child ?? kids[0]?.id;

  let rows: HistoryRow[] = [];
  if (activeChildId) {
    const result = await pool.query<HistoryRow>(
      `SELECT to_char(date_trunc('week', created_at), 'YYYY-MM-DD') AS week,
              COUNT(*)::text AS total,
              SUM(CASE WHEN is_correct THEN 1 ELSE 0 END)::text AS correct
         FROM attempts
        WHERE student_id = $1
        GROUP BY date_trunc('week', created_at)
        ORDER BY date_trunc('week', created_at) DESC
        LIMIT 12`,
      [activeChildId],
    );
    rows = result.rows;
  }

  return (
    <>
      <div className="eyebrow">{L.eyebrow}</div>
      <h1>{L.title}</h1>
      <p className="subtitle">{L.subtitle}</p>

      {rows.length === 0 ? (
        <div className="empty-illust">{L.empty}</div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: 'var(--surface-2)' }}>
                <th style={thStyle}>{L.col_week}</th>
                <th style={thStyle}>{L.col_questions}</th>
                <th style={thStyle}>{L.col_accuracy}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const total = Number(r.total);
                const correct = Number(r.correct);
                const acc = total > 0 ? Math.round((correct / total) * 100) : 0;
                return (
                  <tr key={r.week} style={{ borderTop: '1px solid var(--border-soft)' }}>
                    <td style={tdStyle} className="mono muted">{r.week}</td>
                    <td style={tdStyle}>{total}</td>
                    <td style={tdStyle} className="mono">{acc}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

const thStyle: React.CSSProperties = {
  padding: '10px 18px',
  textAlign: 'left',
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--text-dim)',
  fontWeight: 500,
};

const tdStyle: React.CSSProperties = {
  padding: '12px 18px',
};
