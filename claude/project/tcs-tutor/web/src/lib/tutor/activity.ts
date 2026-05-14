import { pool } from './db';
import { askJSON } from './anthropic';

export interface ActivityStats {
  activeStudents: number;
  enrolledStudents: number;
  totalAttemptsThisWeek: number;
  avgQuestionsPerActiveStudent: number;
  accuracyPercent: number;
  changeVsPrevWeek: { activeStudents: number | null };
}

export interface StuckConcept {
  name: string;
  code: string;
  accuracyPercent: number;
  studentsAffected: number;
}

export interface MissedQuestion {
  body: string;
  conceptName: string;
  wrongCount: number;
  totalCount: number;
}

export async function loadActivityStats(classId: string): Promise<ActivityStats> {
  const [thisWk, prevWk, enrolled] = await Promise.all([
    pool.query<{ active: string; total: string; correct: string }>(
      `SELECT
         COUNT(DISTINCT a.student_id)::text                 AS active,
         COUNT(*)::text                                     AS total,
         SUM(CASE WHEN a.is_correct THEN 1 ELSE 0 END)::text AS correct
       FROM attempts a
       JOIN enrollments e ON e.student_id = a.student_id
        AND e.class_id = $1 AND e.withdrawn_at IS NULL
       WHERE a.created_at >= now() - interval '7 days'`,
      [classId],
    ),
    pool.query<{ active: string }>(
      `SELECT COUNT(DISTINCT a.student_id)::text AS active
         FROM attempts a
         JOIN enrollments e ON e.student_id = a.student_id
          AND e.class_id = $1 AND e.withdrawn_at IS NULL
        WHERE a.created_at >= now() - interval '14 days'
          AND a.created_at <  now() - interval '7 days'`,
      [classId],
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*)::text FROM enrollments WHERE class_id = $1 AND withdrawn_at IS NULL`,
      [classId],
    ),
  ]);

  const active = Number(thisWk.rows[0]?.active ?? 0);
  const total = Number(thisWk.rows[0]?.total ?? 0);
  const correct = Number(thisWk.rows[0]?.correct ?? 0);
  const activePrev = Number(prevWk.rows[0]?.active ?? 0);
  const enrolledCount = Number(enrolled.rows[0]?.count ?? 0);

  return {
    activeStudents: active,
    enrolledStudents: enrolledCount,
    totalAttemptsThisWeek: total,
    avgQuestionsPerActiveStudent: active > 0 ? Math.round(total / active) : 0,
    accuracyPercent: total > 0 ? Math.round((correct / total) * 100) : 0,
    changeVsPrevWeek: {
      activeStudents: activePrev > 0 ? Math.round(((active - activePrev) / activePrev) * 100) : null,
    },
  };
}

export async function loadStuckConcept(classId: string): Promise<StuckConcept | null> {
  const { rows } = await pool.query<{
    name: string; code: string; total: string; correct: string; students: string;
  }>(
    `SELECT c.name, c.code,
            COUNT(*)::text  AS total,
            SUM(CASE WHEN a.is_correct THEN 1 ELSE 0 END)::text AS correct,
            COUNT(DISTINCT a.student_id)::text AS students
       FROM attempts a
       JOIN questions q ON q.id = a.question_id
       JOIN concepts  c ON c.id = q.concept_id
       JOIN enrollments e ON e.student_id = a.student_id
        AND e.class_id = $1 AND e.withdrawn_at IS NULL
      WHERE a.created_at >= now() - interval '7 days'
      GROUP BY c.id, c.name, c.code
      HAVING COUNT(*) >= 3
      ORDER BY (SUM(CASE WHEN a.is_correct THEN 1.0 ELSE 0.0 END) / COUNT(*)) ASC
      LIMIT 1`,
    [classId],
  );
  if (!rows[0]) return null;
  const r = rows[0];
  const total = Number(r.total);
  const correct = Number(r.correct);
  return {
    name: r.name,
    code: r.code,
    accuracyPercent: total > 0 ? Math.round((correct / total) * 100) : 0,
    studentsAffected: Number(r.students),
  };
}

export async function loadMostMissed(classId: string, limit = 5): Promise<MissedQuestion[]> {
  const { rows } = await pool.query<{
    body: string; concept_name: string; wrong: string; total: string;
  }>(
    `SELECT q.body,
            c.name AS concept_name,
            SUM(CASE WHEN a.is_correct THEN 0 ELSE 1 END)::text AS wrong,
            COUNT(*)::text                                       AS total
       FROM attempts a
       JOIN questions q ON q.id = a.question_id
       JOIN concepts  c ON c.id = q.concept_id
       JOIN enrollments e ON e.student_id = a.student_id
        AND e.class_id = $1 AND e.withdrawn_at IS NULL
      WHERE a.created_at >= now() - interval '7 days'
      GROUP BY q.id, q.body, c.name
      HAVING SUM(CASE WHEN a.is_correct THEN 0 ELSE 1 END) > 0
      ORDER BY SUM(CASE WHEN a.is_correct THEN 0 ELSE 1 END) DESC,
               COUNT(*) DESC
      LIMIT $2`,
    [classId, limit],
  );
  return rows.map(r => ({
    body: r.body,
    conceptName: r.concept_name,
    wrongCount: Number(r.wrong),
    totalCount: Number(r.total),
  }));
}

export async function generateInsight(args: {
  stats: ActivityStats;
  stuck: StuckConcept | null;
  missed: MissedQuestion[];
}): Promise<string | null> {
  // Skip if there's not enough data to say anything useful.
  if (args.stats.totalAttemptsThisWeek < 5 || !args.stuck) return null;

  const summary = {
    week_summary: {
      active_students: args.stats.activeStudents,
      enrolled: args.stats.enrolledStudents,
      total_attempts: args.stats.totalAttemptsThisWeek,
      accuracy_percent: args.stats.accuracyPercent,
    },
    weakest_concept: args.stuck && {
      name: args.stuck.name,
      accuracy_percent: args.stuck.accuracyPercent,
      students_affected: args.stuck.studentsAffected,
    },
    most_missed_questions: args.missed.slice(0, 3).map(m => ({
      concept: m.conceptName,
      wrong_count: m.wrongCount,
      stem: m.body.slice(0, 140),
    })),
  };

  try {
    const result = await askJSON<{ insight: string }>({
      system: `You are an AI tutor surfacing teaching insights for a middle-school science teacher.
The teacher is busy. Give ONE specific, actionable insight in 1–2 sentences. Reference the data; do not invent.
Output strict JSON: { "insight": "..." }. No prose, no markdown.`,
      user: `Class activity for the past week:
${JSON.stringify(summary, null, 2)}

Write ONE insight the teacher can act on next class. Be concrete about what's struggling and a minimal next step.`,
      maxTokens: 400,
    });
    return result.data.insight ?? null;
  } catch {
    return null;
  }
}
