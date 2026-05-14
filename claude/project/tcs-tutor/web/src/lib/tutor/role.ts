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
 * Look up the public.users row for the current request.
 *
 * In dev mode, set TUTOR_DEV_USER_ID to a UUID in the users table and we
 * return that row directly (skipping Supabase Auth). When the env var is
 * empty / unset, we go through Supabase Auth and match on email.
 */
export async function getTutorUser(): Promise<TutorUser | null> {
  const devUserId = process.env.TUTOR_DEV_USER_ID?.trim();
  if (devUserId) {
    return loadById(devUserId);
  }

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
