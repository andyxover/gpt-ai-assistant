'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function signInWithGoogle() {
    setBusy(true);
    setErr(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setErr(error.message);
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-stone-200 p-8">
        <h1 className="text-2xl font-bold mb-1">TCS Tutor</h1>
        <p className="text-sm text-stone-600 mb-6">Sign in with your TCS Google account.</p>

        <button
          onClick={signInWithGoogle}
          disabled={busy}
          className="w-full py-3 rounded-lg bg-[#c9874a] hover:bg-[#a86a36] disabled:opacity-50 text-white font-medium"
        >
          {busy ? 'Redirecting…' : 'Sign in with Google'}
        </button>

        {err && (
          <p className="mt-4 text-sm text-red-600">Sign-in failed: {err}</p>
        )}
      </div>
    </main>
  );
}
