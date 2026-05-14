'use server';

import { pool } from '@/lib/tutor/db';
import { getTutorUser } from '@/lib/tutor/role';
import { revalidatePath } from 'next/cache';

export async function setLang(lang: 'en' | 'zh'): Promise<{ ok: boolean }> {
  const user = await getTutorUser();
  if (!user) return { ok: false };
  await pool.query(`UPDATE users SET preferred_lang = $1 WHERE id = $2`, [lang, user.id]);
  revalidatePath('/parent', 'layout');
  return { ok: true };
}

export async function sendTeacherMessage(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  // Phase 3 stub: just acknowledge. Real implementation would write to a
  // messages table and notify the teacher.
  const user = await getTutorUser();
  if (!user || user.role !== 'parent') return { ok: false, error: 'Not signed in as a parent' };
  const text = String(formData.get('text') ?? '').trim();
  if (text.length < 5) return { ok: false, error: 'Message too short.' };
  // TODO: persist to a teacher_messages table when that's modeled.
  console.log(`[parent message] from=${user.id} text=${text}`);
  return { ok: true };
}
