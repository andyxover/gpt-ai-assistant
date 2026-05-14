import { getTutorUser } from '@/lib/tutor/role';
import { getActiveSyllabus, getClassForTeacher } from '@/lib/tutor/classes';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';

type WeekStatus = 'covered' | 'current' | 'next' | 'upcoming';

interface DisplayWeek {
  wk: string;
  weekNums: number[];
  topics: string[];
  status: WeekStatus;
}

interface DisplayChapter {
  title: string;
  status: 'complete' | 'in-progress' | 'upcoming';
  weeks: DisplayWeek[];
}

export default async function ClassProgressPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getTutorUser();
  if (!user) redirect('/login');
  if (user.role !== 'teacher' && user.role !== 'admin') redirect('/');

  const { id } = await params;
  const klass = await getClassForTeacher(id, user.id);
  if (!klass) notFound();

  const syllabus = await getActiveSyllabus(id);
  if (!syllabus) return <EmptyState />;

  const currentWeek = syllabus.current_week;
  const chapters = buildChapterRollup(syllabus.parsed_scope, currentWeek);
  const totalWeeks = chapters.reduce((s, c) => s + c.weeks.reduce((ws, w) => ws + w.weekNums.length, 0), 0);
  const completedWeeks = Math.max(0, Math.min(totalWeeks, currentWeek - 1));
  const percent = totalWeeks > 0 ? Math.round((completedWeeks / totalWeeks) * 100) : 0;

  const nextAssessment = pickNextAssessment(syllabus.parsed_scope, currentWeek);

  return (
    <>
      <div className="card">
        <div className="row" style={{ marginBottom: 14 }}>
          <div>
            <div className="card-title">This semester&apos;s progress</div>
            <div className="card-desc small">Students see &quot;this week&quot; pinned to this progress.</div>
          </div>
          <div className="spacer"></div>
          <span className="mono small dim">Week {currentWeek}{totalWeeks ? ` / ${totalWeeks}` : ''}</span>
        </div>
        <div className="progress">
          <div className="progress-bar"><div style={{ width: `${percent}%` }} /></div>
          <span className="progress-label">{percent}%</span>
        </div>
      </div>

      <div className="scope">
        {chapters.map((ch, i) => {
          const countLabel =
            ch.status === 'complete' ? 'complete' :
            ch.status === 'in-progress' ? 'in progress' :
            'upcoming';
          return (
            <div key={i} className="scope-section">
              <div className="scope-h">
                <h4>{ch.title}</h4>
                <span className="count">{countLabel}</span>
              </div>
              {ch.weeks.map((w, j) => {
                const cls =
                  w.status === 'covered' ? 'scope-row covered' :
                  w.status === 'current' ? 'scope-row current' :
                  'scope-row';
                const chip =
                  w.status === 'covered' ? 'done' :
                  w.status === 'current' ? 'this week' :
                  w.status === 'next' ? 'next week' :
                  'upcoming';
                return (
                  <div key={j} className={cls}>
                    <span className="wk">{w.wk}</span>
                    <span className="topic">{w.topics.join(' · ')}</span>
                    <span className="chip">{chip}</span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {nextAssessment && (
        <div className="card" style={{ marginTop: 18 }}>
          <div className="row">
            <div>
              <div className="card-title">{nextAssessment.name}</div>
              <div className="card-desc small">
                {nextAssessment.scope ?? 'Scope TBD'} ·{' '}
                {nextAssessment.weeksAway > 0
                  ? `${nextAssessment.weeksAway} ${nextAssessment.weeksAway === 1 ? 'week' : 'weeks'} away`
                  : nextAssessment.weeksAway === 0
                  ? 'this week'
                  : 'past'}
              </div>
            </div>
            <div className="spacer"></div>
            <span className="mono small dim">
              {nextAssessment.weightPercent != null ? `${nextAssessment.weightPercent}%` : ''}
            </span>
          </div>
        </div>
      )}
    </>
  );
}

function EmptyState() {
  return (
    <div className="card">
      <div className="card-title">No syllabus uploaded yet</div>
      <div className="card-desc">
        Upload one in <Link href="/teacher/syllabi" style={{ color: 'var(--primary)' }}>Syllabi</Link> and progress will appear here.
      </div>
    </div>
  );
}

function buildChapterRollup(
  scope: import('@/lib/tutor/parse-syllabus').ParsedScope | null,
  currentWeek: number,
): DisplayChapter[] {
  if (!scope || !Array.isArray(scope.chapters)) return [];
  return scope.chapters.map(ch => {
    const weeks: DisplayWeek[] = (ch.weeks ?? []).map(w => {
      const nums = parseWeekRange(w.wk);
      return {
        wk: w.wk,
        weekNums: nums,
        topics: Array.isArray(w.topics) && w.topics.length > 0
          ? w.topics
          : (w.concepts ?? []).map(c => c.name),
        status: classifyWeekRange(nums, currentWeek),
      };
    });
    const allNums = weeks.flatMap(w => w.weekNums);
    const maxWeek = allNums.length ? Math.max(...allNums) : 0;
    const minWeek = allNums.length ? Math.min(...allNums) : 0;
    let chStatus: DisplayChapter['status'];
    if (maxWeek < currentWeek) chStatus = 'complete';
    else if (minWeek <= currentWeek && maxWeek >= currentWeek) chStatus = 'in-progress';
    else chStatus = 'upcoming';
    return { title: ch.title, status: chStatus, weeks };
  });
}

function classifyWeekRange(nums: number[], currentWeek: number): WeekStatus {
  if (!nums.length) return 'upcoming';
  const max = Math.max(...nums);
  const min = Math.min(...nums);
  if (max < currentWeek) return 'covered';
  if (min <= currentWeek && currentWeek <= max) return 'current';
  if (min === currentWeek + 1) return 'next';
  return 'upcoming';
}

function parseWeekRange(wk: string): number[] {
  const nums = String(wk).match(/\d+/g)?.map(Number) ?? [];
  if (nums.length === 0) return [];
  if (nums.length === 1) return [nums[0]];
  const [a, b] = nums;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const out: number[] = [];
  for (let i = lo; i <= hi; i++) out.push(i);
  return out;
}

function pickNextAssessment(
  scope: import('@/lib/tutor/parse-syllabus').ParsedScope | null,
  currentWeek: number,
) {
  if (!scope?.assessments) return null;
  const upcoming = scope.assessments
    .map(a => {
      const weekNums = (a.weeks ?? []).flatMap(parseWeekRange);
      const targetWeek = weekNums.length ? Math.min(...weekNums) : null;
      return targetWeek == null
        ? null
        : {
            name: a.name,
            scope: a.scope,
            weightPercent: a.weight_percent,
            targetWeek,
            weeksAway: targetWeek - currentWeek,
          };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null && x.weeksAway >= 0)
    .sort((a, b) => a.weeksAway - b.weeksAway);
  return upcoming[0] ?? null;
}
