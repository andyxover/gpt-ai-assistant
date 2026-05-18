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
    <>
      <div className="kpi-grid">
        <div className="kpi">
          <div className="label">Active students this week</div>
          <div className="value">{stats.activeStudents} <span className="mono dim small">/ {stats.enrolledStudents}</span></div>
          <div className={`sub ${stats.changeVsPrevWeek.activeStudents != null && stats.changeVsPrevWeek.activeStudents >= 0 ? 'up' : stats.changeVsPrevWeek.activeStudents != null ? 'down' : ''}`}>
            {stats.changeVsPrevWeek.activeStudents != null
              ? `${stats.changeVsPrevWeek.activeStudents >= 0 ? '↑' : '↓'} ${Math.abs(stats.changeVsPrevWeek.activeStudents)}% vs last week`
              : 'no prior-week baseline yet'}
          </div>
        </div>
        <div className="kpi">
          <div className="label">Avg. practice</div>
          <div className="value">{stats.avgQuestionsPerActiveStudent} <span className="mono dim small">Q / student</span></div>
          <div className="sub">{stats.totalAttemptsThisWeek > 0 ? `${stats.accuracyPercent}% accuracy` : 'no attempts yet'}</div>
        </div>
        <div className="kpi">
          <div className="label">Most stuck on</div>
          <div className="value" style={{ fontSize: 18 }}>{stuck?.name ?? '—'}</div>
          <div className="sub">
            {stuck
              ? `${stuck.studentsAffected} student${stuck.studentsAffected === 1 ? '' : 's'} · ${stuck.accuracyPercent}% accuracy`
              : 'not enough data'}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title" style={{ marginBottom: 12 }}>Hot questions this week</div>
        {missed.length === 0 ? (
          <p className="muted small" style={{ margin: 0 }}>Nothing missed yet (or no attempts recorded this week).</p>
        ) : (
          missed.map((m, i) => (
            <div key={i} className="scope-row" style={{ background: 'var(--surface)' }}>
              <span className="wk">×{m.wrongCount}</span>
              <span className="topic">{truncate(m.body, 140)}</span>
              <span className="chip">{m.conceptName}</span>
            </div>
          ))
        )}

        {insight && (
          <div style={{
            marginTop: 14, padding: 12,
            background: 'var(--accent-soft)', borderRadius: 8,
            fontSize: 13, lineHeight: 1.55, color: 'var(--text)',
          }}>
            <strong style={{ color: 'var(--accent)' }}>Insight: </strong>
            {insight}
          </div>
        )}
      </div>
    </>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
