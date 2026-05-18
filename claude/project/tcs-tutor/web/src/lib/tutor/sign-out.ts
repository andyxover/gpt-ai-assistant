'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { DEV_ROLE_COOKIE } from './role';

/**
 * Sign the current user out and bounce to /login. Clears both the
 * Supabase Auth session AND the dev-role cookie, so dev-mode users
 * who were impersonating a seed account land back on the login page
 * cleanly.
 *
 * We intentionally do BOTH every time. Calling supabase.signOut on
 * a session that doesn't exist is a no-op, and deleting a cookie
 * that isn't set is also harmless — so this is safe whether the
 * user got in via real auth or the dev bypass.
 */
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  // Best-effort — don't let a Supabase hiccup block the dev cookie cleanup
  await supabase.auth.signOut().catch(() => undefined);

  const c = await cookies();
  c.delete(DEV_ROLE_COOKIE);

  redirect('/login');
}
