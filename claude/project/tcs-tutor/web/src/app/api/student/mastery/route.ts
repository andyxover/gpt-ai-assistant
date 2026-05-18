import { NextResponse } from 'next/server';
import { getTutorUser } from '@/lib/tutor/role';
import { findActiveSyllabusForStudent } from '@/lib/tutor/mastery';
import { pool } from '@/lib/tutor/db';

interface MasteryRow {
  concept_id: string;
  name: string;
  week_introduced: number;
  score: number;
  attempts: number;
}

export async function GET() {
  const user = await getTutorUser();
  if (!user || user.role !== 'student') {
    return NextResponse.json({ rows: [], currentWeek: 0 }, { status: 401 });
  }
  const syl = await findActiveSyllabusForStudent(user.id);
  if (!syl) return NextResponse.json({ rows: [], currentWeek: 0 });

  const { rows: weekRow } = await pool.query<{ current_week: number }>(
    `SELECT current_week FROM syllabi WHERE id = $1`,
    [syl.id],
  );
  const currentWeek = Number(weekRow[0]?.current_week ?? 1);

  const { rows } = await pool.query<{
    concept_id: string; name: string; week_introduced: number;
    score: string | null; attempts: string | null;
  }>(
    `SELECT c.id AS concept_id,
            c.name,
            c.week_introduced,
            m.score::text AS score,
            m.attempts_count::text AS attempts
       FROM concepts c
       LEFT JOIN mastery m
              ON m.concept_id = c.id AND m.student_id = $2
      WHERE c.syllabus_id = $1
        AND c.week_introduced <= $3 + 1
        AND c.week_introduced >= $3 - 1
        AND c.is_safety_critical = false
      ORDER BY c.week_introduced ASC, c.sequence_order ASC
      LIMIT 12`,
    [syl.id, user.id, currentWeek],
  );

  const out: MasteryRow[] = rows.map(r => ({
    concept_id: r.concept_id,
    name: r.name,
    week_introduced: r.week_introduced,
    score: r.score != null ? Number(r.score) : 0,
    attempts: r.attempts != null ? Number(r.attempts) : 0,
  }));

  return NextResponse.json({ rows: out, currentWeek });
}
