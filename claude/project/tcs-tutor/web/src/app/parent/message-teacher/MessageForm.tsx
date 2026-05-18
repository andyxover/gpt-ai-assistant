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
    <form ref={formRef} onSubmit={onSubmit}>
      <textarea name="text" rows={6} placeholder={L.placeholder} style={{ marginBottom: 12 }} />
      <button type="submit" disabled={pending} className="btn">
        {L.send}
      </button>
      {msg && <p className="small" style={{ color: 'var(--success)', marginTop: 12 }}>{msg}</p>}
      {err && <p className="small" style={{ color: 'var(--danger)', marginTop: 12 }}>{err}</p>}
    </form>
  );
}
