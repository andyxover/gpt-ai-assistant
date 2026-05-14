import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { pool } from './db';

export type TutorRole = 'student' | 'teacher' | 'parent' | 'admin';

export interface TutorUser {
  id: string;
  display_name: string;
  role: TutorRole;
  email: string | null;
  preferred_lang: 'en' | 'zh';
}

/**
 * Demo-seed user IDs the dev role toggle maps to. Keep in sync with
 * the seed script + the demo INSERTs documented in
 * project_tcs_tutor.md.
 */
export const DEV_USER_BY_ROLE: Record<'teacher' | 'student' | 'parent', string> = {
  teacher: '00000000-0000-0000-0000-000000000010',
  student: '00000000-0000-0000-0000-000000000020',
  parent: '00000000-0000-0000-0000-000000000030',
};

export const DEV_ROLE_COOKIE = 'tutor_dev_role';

/**
 * Resolve which dev-bypass user (if any) is active for the current
 * request. Priority: cookie > env var > none. Returns null when
 * dev mode is off entirely.
 */
export async function activeDevUserId(): Promise<string | null> {
  const c = await cookies();
  const cookieRole = c.get(DEV_ROLE_COOKIE)?.value as 'teacher' | 'student' | 'parent' | undefined;
  if (cookieRole && DEV_USER_BY_ROLE[cookieRole]) {
    return DEV_USER_BY_ROLE[cookieRole];
  }
  const envId = process.env.TUTOR_DEV_USER_ID?.trim();
  return envId ? envId : null;
}

/**
 * Look up the public.users row for the current request.
 *
 * Resolution order:
 *  1. `tutor_dev_role` cookie (set by the RoleToggle in the topbar)
 *  2. `TUTOR_DEV_USER_ID` env var (set in .env.local)
 *  3. Supabase Auth + email match against public.users
 */
export async function getTutorUser(): Promise<TutorUser | null> {
  const devId = await activeDevUserId();
  if (devId) return loadById(devId);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return null;
  return loadByEmail(user.email);
}

async function loadById(id: string): Promise<TutorUser | null> {
  const { rows } = await pool.query<TutorUser>(
    `SELECT id, display_name, role, email, preferred_lang
       FROM users
      WHERE id = $1 AND archived_at IS NULL`,
    [id],
  );
  return rows[0] ?? null;
}

async function loadByEmail(email: string): Promise<TutorUser | null> {
  const { rows } = await pool.query<TutorUser>(
    `SELECT id, display_name, role, email, preferred_lang
       FROM users
      WHERE email = $1 AND archived_at IS NULL`,
    [email],
  );
  return rows[0] ?? null;
}
