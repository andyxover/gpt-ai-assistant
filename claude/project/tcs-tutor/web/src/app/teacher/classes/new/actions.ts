'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { pool } from '@/lib/tutor/db';
import { getTutorUser } from '@/lib/tutor/role';

/**
 * Form state shape for `useActionState` on the New Class form.
 * `error` is populated on validation/auth failures; success path
 * never returns (the server action redirects to the new class).
 */
export interface NewClassState {
  error?: string;
}

export async function createClass(
  _prevState: NewClassState,
  formData: FormData,
): Promise<NewClassState> {
  const user = await getTutorUser();
  if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
    return { error: 'Not authorized' };
  }

  const subject = String(formData.get('subject') ?? '').trim();
  const grade = Number(formData.get('grade'));
  const section = String(formData.get('section') ?? '').trim();
  const displayName = String(formData.get('display_name') ?? '').trim();
  const academicYear = String(formData.get('academic_year') ?? '').trim();

  if (!subject) return { error: 'Subject is required' };
  if (!Number.isFinite(grade) || grade < 1 || grade > 12) return { error: 'Grade must be 1-12' };
  if (!section) return { error: 'Section is required' };
  if (!displayName) return { error: 'Display name is required' };
  if (!academicYear) return { error: 'Academic year is required' };

  // Use the school the teacher belongs to (first one if multiple, single-tenant for now)
  const { rows: [schoolRow] } = await pool.query<{ school_id: string }>(
    `SELECT school_id FROM users WHERE id = $1`,
    [user.id],
  );
  if (!schoolRow?.school_id) return { error: 'No school assigned to your account' };

  const { rows: [created] } = await pool.query<{ id: string }>(
    `INSERT INTO classes
       (school_id, teacher_user_id, subject, grade, section, display_name, academic_year)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [schoolRow.school_id, user.id, subject, grade, section, displayName, academicYear],
  );

  revalidatePath('/teacher/classes');
  redirect(`/teacher/classes/${created.id}/roster`);
}
