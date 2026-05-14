import { getTutorUser } from '@/lib/tutor/role';
import { getClassForTeacher } from '@/lib/tutor/classes';
import { pool } from '@/lib/tutor/db';
import { notFound, redirect } from 'next/navigation';
import RosterClient from './RosterClient';

export default async function RosterPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getTutorUser();
  if (!user) redirect('/login');
  if (user.role !== 'teacher' && user.role !== 'admin') redirect('/');

  const { id } = await params;
  const klass = await getClassForTeacher(id, user.id);
  if (!klass) notFound();

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
      ORDER BY u.display_name`,
    [id],
  );

  const initialRows = rows.map(r => ({
    student_id: r.student_id,
    display_name: r.display_name,
    email: r.email,
    enrolled_at: r.enrolled_at,
    total_attempts: Number(r.total_attempts),
    avg_mastery: r.avg_mastery == null ? null : Number(r.avg_mastery),
  }));

  return <RosterClient classId={id} initialRows={initialRows} />;
}
