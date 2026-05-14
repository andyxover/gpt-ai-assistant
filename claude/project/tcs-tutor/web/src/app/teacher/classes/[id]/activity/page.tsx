import { getTutorUser } from '@/lib/tutor/role';
import { getClassForTeacher } from '@/lib/tutor/classes';
import {
  loadActivityStats,
  loadStuckConcept,
  loadMostMissed,
  generateInsight,
} from '@/lib/tutor/activity';
import { notFound, redirect } from 'next/navigation';

export default async function ActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getTutorUser();
  if (!user) redirect('/login');
  if (user.role !== 'teacher' && user.role !== 'admin') redirect('/');

  const { id } = await params;
  const klass = await getClassForTeacher(id, user.id);
  if (!klass) notFound();

  const [stats, stuck, missed] = await Promise.all([
    loadActivityStats(id),
    loadStuckConcept(id),
    loadMostMissed(id, 5),
  ]);

  const insight = await generateInsight({ stats, stuck, missed });

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard
          label="Active students this week"
          big={`${stats.activeStudents}`}
          unit={`/ ${stats.enrolledStudents}`}
          sub={
            stats.changeVsPrevWeek.activeStudents != null
              ? `${stats.changeVsPrevWeek.activeStudents >= 0 ? '↑' : '↓'} ${Math.abs(stats.changeVsPrevWeek.activeStudents)}% vs last week`
              : 'no prior-week baseline yet'
          }
        />
        <StatCard
          label="Avg. practice"
          big={`${stats.avgQuestionsPerActiveStudent}`}
          unit="Q / student"
          sub={stats.totalAttemptsThisWeek > 0 ? `${stats.accuracyPercent}% accuracy` : 'no attempts yet'}
        />
        <StatCard
          label="Most stuck on"
          big={stuck?.name ?? '—'}
          bigSize="small"
          sub={
            stuck
              ? `${stuck.studentsAffected} student${stuck.studentsAffected === 1 ? '' : 's'} · ${stuck.accuracyPercent}% accuracy`
              : 'not enough data'
          }
        />
      </section>

      <section className="bg-white border border-stone-200 rounded-2xl p-5">
        <h2 className="font-semibold mb-3">Most-missed questions this week</h2>
        {missed.length === 0 ? (
          <p className="text-sm text-stone-500">Nothing missed yet (or no attempts recorded this week).</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {missed.map((m, i) => (
              <li key={i} className="py-3 flex items-start gap-3 text-sm">
                <span className="font-mono text-xs text-stone-500 w-10 shrink-0 pt-0.5">×{m.wrongCount}</span>
                <span className="flex-1 text-stone-700">{truncate(m.body, 140)}</span>
                <span className="text-[10px] uppercase tracking-wide bg-stone-100 text-stone-600 px-2 py-0.5 rounded-full shrink-0">
                  {m.conceptName}
                </span>
              </li>
            ))}
          </ul>
        )}

        {insight && (
          <div className="mt-4 p-4 bg-[#fdf6ec] border border-[#e8d3b3] rounded-xl text-sm leading-relaxed">
            <strong className="text-[#a86a36]">Insight: </strong>
            <span className="text-stone-700">{insight}</span>
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({
  label,
  big,
  unit,
  sub,
  bigSize = 'large',
}: {
  label: string;
  big: string;
  unit?: string;
  sub: string;
  bigSize?: 'large' | 'small';
}) {
  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-5">
      <p className="text-xs font-mono text-stone-500 uppercase tracking-wide">{label}</p>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className={bigSize === 'small' ? 'text-lg font-semibold' : 'text-3xl font-semibold'}>{big}</span>
        {unit && <span className="text-xs text-stone-400 font-mono">{unit}</span>}
      </div>
      <p className="text-xs text-stone-600 mt-1">{sub}</p>
    </div>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
