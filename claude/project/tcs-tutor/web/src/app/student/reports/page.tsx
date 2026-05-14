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
    <main className="max-w-3xl mx-auto p-6 sm:p-8">
      <header className="mb-6">
        <h1 className="text-3xl font-bold">Learning reports</h1>
        <p className="text-stone-600 mt-1">How your practice has been going across the semester.</p>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <StatCard label="Questions answered" big={String(total)} />
        <StatCard label="Accuracy" big={`${accuracy}%`} sub={`${correct} correct`} />
        <StatCard label="Days practiced" big={String(days)} />
      </section>

      <section>
        <h2 className="font-semibold mb-3">Mastery by concept</h2>
        {mastery.length === 0 ? (
          <div className="bg-stone-50 border border-stone-200 rounded-2xl p-6 text-center">
            <p className="text-stone-600">No mastery data yet — practice some questions and check back.</p>
          </div>
        ) : (
          <div className="bg-white border border-stone-200 rounded-2xl divide-y divide-stone-100">
            {mastery.map(m => {
              const score = Math.round(Number(m.score));
              return (
                <div key={m.code} className="px-5 py-3">
                  <div className="flex items-baseline justify-between mb-1.5">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{m.name}</p>
                      <p className="text-xs text-stone-500 mt-0.5">
                        {m.chapter_title ?? '(no chapter)'} · W{m.week_introduced}
                      </p>
                    </div>
                    <div className="text-right shrink-0 pl-3">
                      <p className="font-semibold text-stone-900">{score}<span className="text-stone-400 text-sm">/100</span></p>
                      <p className="text-xs text-stone-500 mt-0.5">{m.correct_count}/{m.attempts_count}</p>
                    </div>
                  </div>
                  <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                    <div className={`h-full transition-all ${tierClass(score)}`} style={{ width: `${score}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

function StatCard({ label, big, sub }: { label: string; big: string; sub?: string }) {
  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-4">
      <p className="text-[11px] font-mono uppercase tracking-wide text-stone-500">{label}</p>
      <p className="text-2xl font-semibold mt-1">{big}</p>
      {sub && <p className="text-xs text-stone-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function tierClass(score: number): string {
  if (score >= 80) return 'bg-green-500';
  if (score >= 50) return 'bg-[#c9874a]';
  if (score >= 25) return 'bg-amber-400';
  return 'bg-red-400';
}
