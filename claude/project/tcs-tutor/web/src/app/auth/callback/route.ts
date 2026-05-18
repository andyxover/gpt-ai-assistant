import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { pool } from '@/lib/tutor/db';

/**
 * OAuth callback for Supabase Auth (used by Google SSO + the email
 * confirmation flow). After exchanging the code for a session, we
 * verify the authenticated email is actually enrolled in our `users`
 * table — if not, we sign them out and bounce to /login with an
 * explanatory error.
 *
 * Why not auto-provision: enrollment is a teacher action (rosters
 * are created from class lists). Letting any signed-in Google user
 * create an account silently would dilute the security model.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const origin = url.origin;

  if (!code) {
    return NextResponse.redirect(new URL('/login', origin));
  }

  const supabase = await createClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    const back = new URL('/login', origin);
    back.searchParams.set('err', exchangeError.message);
    return NextResponse.redirect(back);
  }

  // Verify the user is enrolled in our `users` table.
  const { data: { user } } = await supabase.auth.getUser();
  const email = user?.email?.toLowerCase().trim();
  if (!email) {
    const back = new URL('/login', origin);
    back.searchParams.set('err', 'no-email');
    return NextResponse.redirect(back);
  }

  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE lower(email) = $1 AND archived_at IS NULL LIMIT 1`,
    [email],
  );

  if (rows.length === 0) {
    // Not enrolled — sign them out so the next visit is clean.
    await supabase.auth.signOut();
    const back = new URL('/login', origin);
    back.searchParams.set('err', 'not-enrolled');
    return NextResponse.redirect(back);
  }

  return NextResponse.redirect(new URL('/', origin));
}
