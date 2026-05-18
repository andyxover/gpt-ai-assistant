'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { DEV_ROLE_COOKIE } from '@/lib/tutor/role';

const VALID: ReadonlyArray<'teacher' | 'student' | 'parent'> = ['teacher', 'student', 'parent'];

export async function setDevRole(role: 'teacher' | 'student' | 'parent'): Promise<{ ok: boolean }> {
  if (!VALID.includes(role)) return { ok: false };
  const c = await cookies();
  c.set(DEV_ROLE_COOKIE, role, {
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    httpOnly: false,
    sameSite: 'lax',
  });
  revalidatePath('/', 'layout');
  return { ok: true };
}
