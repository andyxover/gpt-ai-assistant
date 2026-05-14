import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const back = url.clone();
      back.pathname = '/login';
      back.searchParams.set('err', error.message);
      return NextResponse.redirect(back);
    }
  }

  const home = url.clone();
  home.pathname = '/';
  home.search = '';
  return NextResponse.redirect(home);
}
