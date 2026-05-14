'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Mode = 'sign-in' | 'sign-up';

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'google' | 'email' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function signInWithGoogle() {
    setBusy('google');
    setErr(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setErr(error.message);
      setBusy(null);
    }
  }

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy('email');
    setErr(null);
    setMsg(null);
    const supabase = createClient();

    if (mode === 'sign-up') {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) { setErr(error.message); setBusy(null); return; }
      setMsg('Check your email for a confirmation link. Your teacher must have enrolled you with this email first.');
      setBusy(null);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setErr(error.message); setBusy(null); return; }
    window.location.href = '/';
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-stone-200 p-8">
        <h1 className="text-2xl font-bold mb-1">TCS Tutor</h1>
        <p className="text-sm text-stone-600 mb-6">
          {mode === 'sign-in' ? 'Sign in to continue.' : 'Create your account.'}
        </p>

        <button
          onClick={signInWithGoogle}
          disabled={busy !== null}
          className="w-full py-2.5 rounded-lg border border-stone-300 hover:bg-stone-50 disabled:opacity-50 font-medium text-sm flex items-center justify-center gap-2"
        >
          {busy === 'google' ? 'Redirecting…' : 'Continue with Google'}
        </button>

        <div className="flex items-center gap-3 my-4">
          <div className="flex-1 h-px bg-stone-200" />
          <span className="text-xs text-stone-400">OR</span>
          <div className="flex-1 h-px bg-stone-200" />
        </div>

        <form onSubmit={submitEmail} className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="Email"
            required
            autoComplete="email"
            className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:border-[#c9874a]"
          />
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Password"
            required
            minLength={8}
            autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
            className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:border-[#c9874a]"
          />
          <button
            type="submit"
            disabled={busy !== null}
            className="w-full py-2.5 rounded-lg bg-[#c9874a] hover:bg-[#a86a36] disabled:opacity-50 text-white font-medium"
          >
            {busy === 'email' ? '…' : mode === 'sign-in' ? 'Sign in' : 'Sign up'}
          </button>
        </form>

        <button
          onClick={() => { setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in'); setErr(null); setMsg(null); }}
          className="block w-full text-center text-xs text-stone-500 hover:text-stone-900 mt-4"
        >
          {mode === 'sign-in' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
        </button>

        {msg && <p className="mt-4 text-sm text-green-700">{msg}</p>}
        {err && <p className="mt-4 text-sm text-red-600">{err}</p>}
      </div>
    </main>
  );
}
