'use client';

import { useState, useTransition, useRef } from 'react';
import { sendTeacherMessage } from '../actions';

const STRINGS = {
  en: { placeholder: 'Type your message…', send: 'Send', sent: 'Message sent. The teacher will reply soon.', too_short: 'Message too short.' },
  zh: { placeholder: '輸入訊息…', send: '送出', sent: '已送出。老師會盡快回覆。', too_short: '訊息太短。' },
} as const;

export default function MessageForm({ lang }: { lang: 'en' | 'zh' }) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const L = STRINGS[lang];

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const data = new FormData(formEl);
    setMsg(null);
    setErr(null);
    startTransition(async () => {
      const res = await sendTeacherMessage(data);
      if (!res.ok) {
        setErr(res.error ?? L.too_short);
        return;
      }
      setMsg(L.sent);
      formRef.current?.reset();
    });
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-4">
      <textarea
        name="text"
        rows={6}
        placeholder={L.placeholder}
        className="w-full px-4 py-3 border border-stone-300 rounded-lg focus:outline-none focus:border-[#c9874a]"
      />
      <button
        type="submit"
        disabled={pending}
        className="px-5 py-2.5 rounded-lg bg-[#c9874a] hover:bg-[#a86a36] disabled:opacity-50 text-white font-medium"
      >
        {L.send}
      </button>
      {msg && <p className="text-sm text-green-700">{msg}</p>}
      {err && <p className="text-sm text-red-600">{err}</p>}
    </form>
  );
}
