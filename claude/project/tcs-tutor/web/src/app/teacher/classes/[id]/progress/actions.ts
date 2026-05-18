'use server';

import { revalidatePath } from 'next/cache';
import { pool } from '@/lib/tutor/db';
import { getTutorUser } from '@/lib/tutor/role';

export interface SetWeekResult {
  ok: boolean;
  currentWeek?: number;
  error?: string;
}

export async function setCurrentWeek(opts: {
  classId: string;
  syllabusId: string;
  week: number;
}): Promise<SetWeekResult> {
  const user = await getTutorUser();
  if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
    return { ok: false, error: 'Not authorized' };
  }

  const week = Math.round(Number(opts.week));
  if (!Number.isFinite(week) || week < 1 || week > 30) {
    return { ok: false, error: 'Week must be 1–30.' };
  }

  // Verify the teacher owns the class for this syllabus
  const { rows: [owner] } = await pool.query<{ teacher_user_id: string }>(
    `SELECT c.teacher_user_id
       FROM syllabi s
       JOIN classes c ON c.id = s.class_id
      WHERE s.id = $1`,
    [opts.syllabusId],
  );
  if (!owner) return { ok: false, error: 'Syllabus not found' };
  if (owner.teacher_user_id !== user.id && user.role !== 'admin') {
    return { ok: false, error: 'You do not own this class' };
  }

  await pool.query(
    `UPDATE syllabi SET current_week = $2 WHERE id = $1`,
    [opts.syllabusId, week],
  );

  revalidatePath(`/teacher/classes/${opts.classId}/progress`);
  revalidatePath(`/teacher/classes/${opts.classId}/activity`);
  revalidatePath('/student');
  revalidatePath('/student/practice');
  revalidatePath('/student/chat');
  revalidatePath('/parent/this-week');

  return { ok: true, currentWeek: week };
}
