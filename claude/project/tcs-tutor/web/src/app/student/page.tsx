import { getTutorUser } from '@/lib/tutor/role';
import { findActiveSyllabusForStudent } from '@/lib/tutor/mastery';
import { pool } from '@/lib/tutor/db';
import { redirect } from 'next/navigation';
import Link from 'next/link';

interface WeekFocus {
  conceptNames: string[];
  currentWeek: number;
  totalWeeks: number;
  className: string | null;
}

interface WeekStats {
  attempts: number;
  correct: number;
}

async function loadWeekFocus(studentId: string): Promise<WeekFocus | null> {
  const syllabus = await findActiveSyllabusForStudent(studentId);
  if (!syllabus) return null;

  const { rows: [syl] } = await pool.query<{ current_week: number; total_weeks: number; class_name: string }>(
    `SELECT s.current_week,
            (SELECT MAX(week_introduced) FROM concepts WHERE syllabus_id = s.id) AS total_weeks,
            c.display_name AS class_name
       FROM syllabi s
       JOIN classes c ON c.id = s.class_id
      WHERE s.id = $1`,
    [syllabus.id],
  );
  const { rows: concepts } = await pool.query<{ name: string }>(
    `SELECT name FROM concepts WHERE syllabus_id = $1 AND week_introduced = $2 ORDER BY sequence_order`,
    [syllabus.id, syl?.current_week],
  );
  return {
    conceptNames: concepts.map(c => c.name),
    currentWeek: Number(syl?.current_week ?? 0),
    totalWeeks: Number(syl?.total_weeks ?? 0),
    className: syl?.class_name ?? null,
  };
}

async function loadWeekStats(studentId: string): Promise<WeekStats> {
  const { rows: [r] } = await pool.query<{ total: string; correct: string }>(
    `SELECT COUNT(*)::text AS total,
            SUM(CASE WHEN is_correct THEN 1 ELSE 0 END)::text AS correct
       FROM attempts WHERE student_id = $1 AND created_at >= now() - interval '7 days'`,
    [studentId],
  );
  return { attempts: Number(r.total), correct: Number(r.correct) };
}

export default async function StudentHome() {
  const user = await getTutorUser();
  if (!user) redirect('/login');
  if (user.role !== 'student') redirect('/');

  const [focus, stats] = await Promise.all([
    loadWeekFocus(user.id),
    loadWeekStats(user.id),
  ]);

  const headerTitle = focus?.conceptNames.length
    ? focus.conceptNames[0]
    : 'Welcome';
  const lede = focus?.conceptNames.length
    ? `This week: ${focus.conceptNames.join(' · ')}.`
    : `Hi ${user.display_name} — sign up your teacher or sign in to a class to get started.`;
  const accuracy = stats.attempts > 0 ? Math.round((stats.correct / stats.attempts) * 100) : 0;

  return (
    <>
      <div className="student-header">
        <div className="eyebrow">This week&apos;s focus</div>
        <h1>{headerTitle}</h1>
        <p>{lede}</p>
        <div className="student-meta">
          {focus && (
            <span>Week {focus.currentWeek}{focus.totalWeeks ? ` of ${focus.totalWeeks}` : ''}</span>
          )}
          {focus?.className && <span>· {focus.className}</span>}
          <span>· {stats.attempts} {stats.attempts === 1 ? 'question' : 'questions'} this week</span>
          {stats.attempts > 0 && <span>· {accuracy}% accuracy</span>}
        </div>
      </div>

      <div className="action-cards">
        <Link href="/student/practice?mode=review" className="action">
          <div className="label">Practice mode</div>
          <div className="title">Review</div>
          <div className="desc">Practice what you&apos;ve already covered. The mastery engine picks the questions you need most.</div>
          <div className="meta">→ Start a review session</div>
        </Link>
        <Link href="/student/practice?mode=preview" className="action">
          <div className="label">Practice mode</div>
          <div className="title">Preview</div>
          <div className="desc">Look ahead at upcoming material. Useful when next week&apos;s topic is going to be tricky.</div>
          <div className="meta">→ Try next-week concepts</div>
        </Link>
        <Link href="/student/practice?mode=exam_prep" className="action">
          <div className="label">Practice mode</div>
          <div className="title">Exam prep</div>
          <div className="desc">Targeted practice before a test. Weighted toward concepts in the upcoming exam scope.</div>
          <div className="meta">→ Start exam-prep drills</div>
        </Link>
      </div>

      <h2>Or just chat</h2>
      <p className="muted small" style={{ marginTop: -4, marginBottom: 14 }}>
        Ask the tutor anything about this week&apos;s concepts. I won&apos;t just give you the answer — I&apos;ll help you think through it.
      </p>
      <Link href="/student/chat" className="btn">Open the chat tutor</Link>
    </>
  );
}
