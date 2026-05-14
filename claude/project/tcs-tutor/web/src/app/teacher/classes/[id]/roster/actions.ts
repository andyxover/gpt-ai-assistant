'use server';

import { revalidatePath } from 'next/cache';
import { pool } from '@/lib/tutor/db';
import { getTutorUser } from '@/lib/tutor/role';

export interface EnrollResult {
  ok: boolean;
  studentId?: string;
  created?: boolean;
  error?: string;
}

export async function enrollStudent(formData: FormData): Promise<EnrollResult> {
  const teacher = await getTutorUser();
  if (!teacher || (teacher.role !== 'teacher' && teacher.role !== 'admin')) {
    return { ok: false, error: 'Not authorized' };
  }
  const classId = String(formData.get('class_id') ?? '').trim();
  const displayName = String(formData.get('display_name') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  if (!classId) return { ok: false, error: 'class_id is required' };
  if (!displayName) return { ok: false, error: 'Student name is required' };
  if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) return { ok: false, error: 'Valid email is required' };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verify the teacher owns this class
    const { rows: [klass] } = await client.query<{ school_id: string }>(
      `SELECT school_id FROM classes
        WHERE id = $1 AND teacher_user_id = $2 AND archived_at IS NULL`,
      [classId, teacher.id],
    );
    if (!klass) {
      await client.query('ROLLBACK');
      return { ok: false, error: 'Class not found or not yours' };
    }

    // Upsert student user
    const { rows: existing } = await client.query<{ id: string; role: string }>(
      `SELECT id, role FROM users WHERE email = $1 AND archived_at IS NULL`,
      [email],
    );
    let studentId: string;
    let created = false;
    if (existing[0]) {
      if (existing[0].role !== 'student') {
        await client.query('ROLLBACK');
        return { ok: false, error: `That email is already a ${existing[0].role}, not a student` };
      }
      studentId = existing[0].id;
    } else {
      const { rows: [u] } = await client.query<{ id: string }>(
        `INSERT INTO users (school_id, role, display_name, email)
         VALUES ($1, 'student', $2, $3) RETURNING id`,
        [klass.school_id, displayName, email],
      );
      studentId = u.id;
      created = true;
    }

    // Enroll if not already
    await client.query(
      `INSERT INTO enrollments (student_id, class_id, enrolled_at)
       VALUES ($1, $2, now())
       ON CONFLICT (class_id, student_id) DO UPDATE
         SET withdrawn_at = NULL, enrolled_at = COALESCE(enrollments.enrolled_at, now())`,
      [studentId, classId],
    );

    await client.query('COMMIT');
    revalidatePath(`/teacher/classes/${classId}/roster`);
    return { ok: true, studentId, created };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    client.release();
  }
}

export async function withdrawStudent(opts: {
  classId: string;
  studentId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const teacher = await getTutorUser();
  if (!teacher || (teacher.role !== 'teacher' && teacher.role !== 'admin')) {
    return { ok: false, error: 'Not authorized' };
  }
  const { rowCount } = await pool.query(
    `UPDATE enrollments SET withdrawn_at = now()
       WHERE class_id = $1 AND student_id = $2 AND withdrawn_at IS NULL
         AND class_id IN (SELECT id FROM classes WHERE teacher_user_id = $3)`,
    [opts.classId, opts.studentId, teacher.id],
  );
  if (!rowCount) return { ok: false, error: 'No active enrollment found' };
  revalidatePath(`/teacher/classes/${opts.classId}/roster`);
  return { ok: true };
}
