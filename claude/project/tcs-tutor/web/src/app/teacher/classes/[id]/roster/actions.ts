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

// ───────────────────────────────────────────────────────────────────────
// Parent linkage
// ───────────────────────────────────────────────────────────────────────

export interface LinkParentResult {
  ok: boolean;
  parentId?: string;
  /** True if we created a new users row for the parent; false if we
   *  reused an existing row (multi-child scenario). */
  parentCreated?: boolean;
  /** True if a new parent_links row was inserted; false if the link
   *  already existed (idempotent). */
  linkCreated?: boolean;
  error?: string;
}

/**
 * Link a parent to one of the teacher's students. Upserts the parent
 * `users` row (reuses by email if already a parent), then inserts a
 * row into `parent_links` with consent_given_at = now(). The teacher
 * checking the consent box IS the consent record.
 *
 * Authorization: teacher must own a class where the student is
 * currently enrolled (verified inside the transaction).
 */
export async function linkParentToStudent(opts: {
  classId: string;
  studentId: string;
  parentEmail: string;
  parentDisplayName: string;
  relationship: string;        // 'parent' | 'guardian' | 'other'
  preferredLang: 'en' | 'zh';
  consentConfirmed: boolean;
}): Promise<LinkParentResult> {
  const teacher = await getTutorUser();
  if (!teacher || (teacher.role !== 'teacher' && teacher.role !== 'admin')) {
    return { ok: false, error: 'Not authorized' };
  }

  const email = opts.parentEmail.trim().toLowerCase();
  const displayName = opts.parentDisplayName.trim();
  const relationship = (opts.relationship || 'parent').trim();
  const lang = opts.preferredLang === 'en' ? 'en' : 'zh';

  if (!opts.consentConfirmed) {
    return { ok: false, error: 'Please confirm consent was collected from the parent.' };
  }
  if (!displayName) return { ok: false, error: 'Parent name is required' };
  if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) return { ok: false, error: 'Valid email is required' };
  if (!['parent', 'guardian', 'other'].includes(relationship)) {
    return { ok: false, error: 'Relationship must be parent, guardian, or other' };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Ownership check: this student must be enrolled in a class
    // owned by the calling teacher (defends against a teacher linking
    // a parent to another teacher's student).
    const { rows: [auth] } = await client.query<{ school_id: string }>(
      `SELECT c.school_id
         FROM enrollments e
         JOIN classes c ON c.id = e.class_id
        WHERE e.student_id = $1
          AND e.class_id = $2
          AND e.withdrawn_at IS NULL
          AND c.teacher_user_id = $3
          AND c.archived_at IS NULL
        LIMIT 1`,
      [opts.studentId, opts.classId, teacher.id],
    );
    if (!auth) {
      await client.query('ROLLBACK');
      return { ok: false, error: 'Student not found in a class you own.' };
    }

    // Upsert parent user. If the email already belongs to a non-parent
    // role, reject — we don't want to silently change someone's role.
    const { rows: existing } = await client.query<{ id: string; role: string }>(
      `SELECT id, role FROM users WHERE email = $1 AND archived_at IS NULL`,
      [email],
    );
    let parentId: string;
    let parentCreated = false;
    if (existing[0]) {
      if (existing[0].role !== 'parent') {
        await client.query('ROLLBACK');
        return {
          ok: false,
          error: `That email is already a ${existing[0].role}, not a parent.`,
        };
      }
      parentId = existing[0].id;
    } else {
      const { rows: [u] } = await client.query<{ id: string }>(
        `INSERT INTO users (school_id, role, display_name, email, preferred_lang)
         VALUES ($1, 'parent', $2, $3, $4) RETURNING id`,
        [auth.school_id, displayName, email, lang],
      );
      parentId = u.id;
      parentCreated = true;
    }

    // Insert the link with consent timestamp. Idempotent — if the
    // link already existed, we leave the prior consent_given_at alone
    // (so the original consent record is preserved).
    const { rowCount: inserted } = await client.query(
      `INSERT INTO parent_links
         (parent_user_id, student_user_id, relationship, consent_given_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (parent_user_id, student_user_id) DO NOTHING`,
      [parentId, opts.studentId, relationship],
    );

    await client.query('COMMIT');
    revalidatePath(`/teacher/classes/${opts.classId}/roster`);
    return {
      ok: true,
      parentId,
      parentCreated,
      linkCreated: (inserted ?? 0) > 0,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    client.release();
  }
}

/**
 * Remove a parent_links row. The parent user row is left intact —
 * they may still be linked to other students. Cleaning up orphaned
 * parent rows is a separate concern (and probably best left manual).
 */
export async function unlinkParentFromStudent(opts: {
  classId: string;
  studentId: string;
  parentId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const teacher = await getTutorUser();
  if (!teacher || (teacher.role !== 'teacher' && teacher.role !== 'admin')) {
    return { ok: false, error: 'Not authorized' };
  }

  // Ownership check: same as linkParentToStudent — teacher must own
  // a class where this student is currently enrolled.
  const { rowCount } = await pool.query(
    `DELETE FROM parent_links pl
       USING enrollments e, classes c
      WHERE pl.parent_user_id = $1
        AND pl.student_user_id = $2
        AND e.student_id = $2
        AND e.class_id = $3
        AND e.withdrawn_at IS NULL
        AND c.id = e.class_id
        AND c.teacher_user_id = $4`,
    [opts.parentId, opts.studentId, opts.classId, teacher.id],
  );

  if (!rowCount) return { ok: false, error: 'No matching parent link found, or not yours to remove.' };
  revalidatePath(`/teacher/classes/${opts.classId}/roster`);
  return { ok: true };
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
