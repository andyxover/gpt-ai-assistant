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
  en: { title: 'Learning history', empty: 'No practice history yet.', col_week: 'Week', col_questions: 'Questions', col_accuracy: 'Accuracy' },
  zh: { title: '學習歷程', empty: '尚無練習紀錄。', col_week: '週次', col_questions: '題數', col_accuracy: '正確率' },
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
    <main className="max-w-3xl mx-auto p-6 sm:p-8">
      <h1 className="text-3xl font-bold mb-6">{L.title}</h1>

      {rows.length === 0 ? (
        <p className="text-stone-600">{L.empty}</p>
      ) : (
        <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-left text-xs uppercase font-mono text-stone-500">
              <tr>
                <th className="px-5 py-3">{L.col_week}</th>
                <th className="px-5 py-3">{L.col_questions}</th>
                <th className="px-5 py-3">{L.col_accuracy}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {rows.map(r => {
                const total = Number(r.total);
                const correct = Number(r.correct);
                const acc = total > 0 ? Math.round((correct / total) * 100) : 0;
                return (
                  <tr key={r.week}>
                    <td className="px-5 py-3 font-mono text-stone-600">{r.week}</td>
                    <td className="px-5 py-3">{total}</td>
                    <td className="px-5 py-3">{acc}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
