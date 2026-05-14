import { getTutorUser } from '@/lib/tutor/role';
import { getActiveSyllabus, getClassForTeacher } from '@/lib/tutor/classes';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';

type WeekStatus = 'done' | 'this-week' | 'next-week' | 'upcoming';

interface DisplayWeek {
  wk: string;          // e.g. "W1" or "W3-W4"
  weekNums: number[];  // [1] or [3,4]
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
  if (!syllabus) {
    return (
      <EmptyState classId={id} />
    );
  }

  const scope = syllabus.parsed_scope;
  const currentWeek = syllabus.current_week;

  const chapters = buildChapterRollup(scope, currentWeek);
  const totalWeeks = chapters.reduce((s, c) => s + c.weeks.reduce((ws, w) => ws + w.weekNums.length, 0), 0);
  const completedWeeks = Math.max(0, Math.min(totalWeeks, currentWeek - 1));
  const percent = totalWeeks > 0 ? Math.round((completedWeeks / totalWeeks) * 100) : 0;

  const nextAssessment = pickNextAssessment(scope, currentWeek);

  return (
    <div className="space-y-6">
      <section className="bg-white border border-stone-200 rounded-2xl p-6">
        <div className="flex items-baseline justify-between mb-1">
          <h2 className="font-semibold text-lg">This semester&apos;s progress</h2>
          <p className="text-sm text-stone-500 font-mono">
            Week {currentWeek} {totalWeeks > 0 && <>/ {totalWeeks}</>}
          </p>
        </div>
        <p className="text-xs text-stone-500 mb-4">
          Students see &quot;this week&quot; pinned to this progress.
        </p>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 bg-stone-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#c9874a] transition-all"
              style={{ width: `${percent}%` }}
            />
          </div>
          <span className="text-sm font-medium text-stone-700 w-12 text-right">{percent}%</span>
        </div>
      </section>

      {chapters.map((ch, i) => (
        <ChapterCard key={i} chapter={ch} />
      ))}

      {nextAssessment && (
        <section className="bg-stone-50 border border-stone-200 rounded-2xl p-5">
          <div className="flex items-baseline justify-between">
            <div>
              <p className="font-medium">{nextAssessment.name}</p>
              <p className="text-sm text-stone-600 mt-0.5">
                {nextAssessment.scope ?? 'Scope TBD'}
                {' · '}
                {nextAssessment.weeksAway > 0
                  ? `${nextAssessment.weeksAway} ${nextAssessment.weeksAway === 1 ? 'week' : 'weeks'} away (Week ${nextAssessment.targetWeek})`
                  : nextAssessment.weeksAway === 0
                  ? 'this week'
                  : 'past'}
              </p>
            </div>
            <p className="text-xs text-stone-500 font-mono">
              {nextAssessment.weightPercent != null ? `${nextAssessment.weightPercent}%` : ''}
            </p>
          </div>
        </section>
      )}
    </div>
  );
}

function ChapterCard({ chapter }: { chapter: DisplayChapter }) {
  const statusLabel =
    chapter.status === 'complete' ? 'complete'
    : chapter.status === 'in-progress' ? 'in progress'
    : 'upcoming';
  const statusClass =
    chapter.status === 'complete' ? 'text-green-700'
    : chapter.status === 'in-progress' ? 'text-[#a86a36]'
    : 'text-stone-500';

  return (
    <section className="bg-white border border-stone-200 rounded-2xl p-5">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="font-semibold">{chapter.title}</h3>
        <span className={`text-xs ${statusClass}`}>{statusLabel}</span>
      </div>
      <ul className="space-y-1.5">
        {chapter.weeks.map((w, i) => (
          <li key={i} className="flex items-center gap-3 text-sm">
            <span className={`w-10 font-mono text-xs shrink-0 ${
              w.status === 'this-week' ? 'text-[#a86a36] font-semibold' : 'text-stone-500'
            }`}>
              {w.wk}
            </span>
            <span className={`flex-1 ${w.status === 'this-week' ? 'text-stone-900' : 'text-stone-600'}`}>
              {w.topics.join(' · ')}
            </span>
            <WeekChip status={w.status} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function WeekChip({ status }: { status: WeekStatus }) {
  const map: Record<WeekStatus, { label: string; cls: string }> = {
    done: { label: 'done', cls: 'bg-green-50 text-green-700' },
    'this-week': { label: 'this week', cls: 'bg-[#c9874a] text-white' },
    'next-week': { label: 'next week', cls: 'bg-amber-50 text-amber-800' },
    upcoming: { label: 'upcoming', cls: 'bg-stone-100 text-stone-500' },
  };
  const m = map[status];
  return <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full uppercase tracking-wide shrink-0 ${m.cls}`}>{m.label}</span>;
}

function EmptyState({ classId }: { classId: string }) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6">
      <p className="font-medium">No syllabus yet</p>
      <p className="text-sm text-stone-600 mt-1">
        Upload one on the{' '}
        <Link href="/teacher/syllabi" className="text-[#a86a36] underline">Syllabi page</Link>{' '}
        and progress will appear here.
      </p>
      <p className="text-xs text-stone-400 mt-3">Class ID: {classId}</p>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// helpers
// ────────────────────────────────────────────────────────────────────────────

function buildChapterRollup(scope: import('@/lib/tutor/parse-syllabus').ParsedScope | null, currentWeek: number): DisplayChapter[] {
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
  if (max < currentWeek) return 'done';
  if (min <= currentWeek && currentWeek <= max) return 'this-week';
  if (min === currentWeek + 1) return 'next-week';
  return 'upcoming';
}

function parseWeekRange(wk: string): number[] {
  // Examples: "W3", "W3-W4", "W7-W9"
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

function pickNextAssessment(scope: import('@/lib/tutor/parse-syllabus').ParsedScope | null, currentWeek: number) {
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
