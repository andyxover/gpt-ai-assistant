'use server';

import { revalidatePath } from 'next/cache';
import { pool } from '@/lib/tutor/db';
import { getTutorUser } from '@/lib/tutor/role';

type Resolution = 'reviewed_kept' | 'reviewed_rejected';

export async function resolveFlag(opts: {
  flagId: string;
  resolution: Resolution;
  note?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const user = await getTutorUser();
  if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
    return { ok: false, error: 'Not authorized' };
  }
  if (!['reviewed_kept', 'reviewed_rejected'].includes(opts.resolution)) {
    return { ok: false, error: 'Invalid resolution' };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Look up the question and verify the teacher owns it
    const { rows: [row] } = await client.query<{ question_id: string; teacher_user_id: string }>(
      `SELECT q.id AS question_id, cls.teacher_user_id
         FROM flagged_items f
         JOIN questions q ON q.id = f.question_id
         JOIN concepts  c ON c.id = q.concept_id
         JOIN syllabi   s ON s.id = c.syllabus_id
         JOIN classes  cls ON cls.id = s.class_id
        WHERE f.id = $1`,
      [opts.flagId],
    );
    if (!row) {
      await client.query('ROLLBACK');
      return { ok: false, error: 'Flag not found' };
    }
    if (row.teacher_user_id !== user.id && user.role !== 'admin') {
      await client.query('ROLLBACK');
      return { ok: false, error: 'You do not own this question' };
    }

    await client.query(
      `UPDATE flagged_items
          SET status = $2,
              resolved_by_user_id = $3,
              resolved_at = now(),
              resolution_note = $4
        WHERE id = $1`,
      [opts.flagId, opts.resolution, user.id, opts.note ?? null],
    );

    // If rejected, retire the question so the mastery engine stops serving it.
    if (opts.resolution === 'reviewed_rejected') {
      await client.query(
        `UPDATE questions
            SET retired_at = now(),
                retired_reason = COALESCE($2, 'Retired via flag review')
          WHERE id = $1`,
        [row.question_id, opts.note ?? null],
      );
    }

    await client.query('COMMIT');
    revalidatePath('/teacher/flagged');
    return { ok: true };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    client.release();
  }
}
