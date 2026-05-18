import { NextResponse } from 'next/server';
import { getTutorUser } from '@/lib/tutor/role';
import { pool } from '@/lib/tutor/db';

interface ParentLinkOut {
  parent_id: string;
  display_name: string;
  email: string | null;
  relationship: string;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getTutorUser();
  if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
    return NextResponse.json({ rows: [], parentsByStudent: {} }, { status: 401 });
  }
  const { id } = await params;
  const { rows } = await pool.query<{
    student_id: string; display_name: string; email: string | null; enrolled_at: string;
    total_attempts: string; avg_mastery: string | null;
  }>(
    `SELECT u.id AS student_id, u.display_name, u.email, e.enrolled_at,
            (SELECT COUNT(*) FROM attempts a WHERE a.student_id = u.id)::text AS total_attempts,
            (SELECT AVG(m.score) FROM mastery m WHERE m.student_id = u.id)::text AS avg_mastery
       FROM enrollments e
       JOIN users u ON u.id = e.student_id
      WHERE e.class_id = $1 AND e.withdrawn_at IS NULL
        AND e.class_id IN (SELECT id FROM classes WHERE teacher_user_id = $2)
      ORDER BY u.display_name`,
    [id, user.id],
  );

  const studentIds = rows.map(r => r.student_id);
  const parentsByStudent: Record<string, ParentLinkOut[]> = {};
  if (studentIds.length > 0) {
    const { rows: parentRows } = await pool.query<{
      student_user_id: string;
      parent_user_id: string;
      relationship: string;
      display_name: string;
      email: string | null;
    }>(
      `SELECT pl.student_user_id, pl.parent_user_id, pl.relationship,
              u.display_name, u.email
         FROM parent_links pl
         JOIN users u ON u.id = pl.parent_user_id
        WHERE pl.student_user_id = ANY($1::uuid[])
          AND u.archived_at IS NULL
        ORDER BY u.display_name`,
      [studentIds],
    );
    for (const r of parentRows) {
      if (!parentsByStudent[r.student_user_id]) parentsByStudent[r.student_user_id] = [];
      parentsByStudent[r.student_user_id].push({
        parent_id: r.parent_user_id,
        display_name: r.display_name,
        email: r.email,
        relationship: r.relationship,
      });
    }
  }

  return NextResponse.json({
    rows: rows.map(r => ({
      student_id: r.student_id,
      display_name: r.display_name,
      email: r.email,
      enrolled_at: r.enrolled_at,
      total_attempts: Number(r.total_attempts),
      avg_mastery: r.avg_mastery == null ? null : Number(r.avg_mastery),
    })),
    parentsByStudent,
  });
}
