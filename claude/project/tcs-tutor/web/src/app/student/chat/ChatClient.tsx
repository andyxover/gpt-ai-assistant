'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { sendChat } from './actions';
import type { ChatMessage } from '@/lib/tutor/chat';

export default function ChatClient(props: {
  initialMessages: ChatMessage[];
  scopeLabel: string | null;
  studentInitial: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(props.initialMessages);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, pending]);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const formData = new FormData(formEl);
    const text = String(formData.get('text') ?? '').trim();
    if (!text || pending) return;

    const optimistic: ChatMessage = {
      id: `tmp-${Date.now()}`,
      role: 'student',
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, optimistic]);
    if (inputRef.current) inputRef.current.value = '';
    setErr(null);

    startTransition(async () => {
      const form = new FormData();
      form.set('text', text);
      const res = await sendChat(form);
      if (!res.ok) {
        setErr(res.error ?? 'Send failed.');
        return;
      }
      const apiRes = await fetch('/api/student-chat/messages', { cache: 'no-store' });
      if (apiRes.ok) {
        const data: { messages: ChatMessage[] } = await apiRes.json();
        setMessages(data.messages);
      }
    });
  }

  return (
    <div className="chat">
      <div className="chat-head">
        <div className="avatar">TT</div>
        <div>
          <div className="title">TCS Tutor</div>
          <div className="sub">Socratic — I won&apos;t just give you the answer</div>
        </div>
        {props.scopeLabel && <span className="chat-scope-tag">Scope: {props.scopeLabel}</span>}
      </div>

      <div className="chat-body" style={{ maxHeight: 'calc(100vh - 280px)', minHeight: 380 }}>
        {messages.length === 0 && (
          <div className="empty-illust">
            Ask me anything about this week&apos;s concepts.
          </div>
        )}

        {messages.map(m => (
          <div key={m.id} className={`msg ${m.role === 'student' ? 'user' : 'ai'}`}>
            <div className="ava">{m.role === 'student' ? props.studentInitial : 'AI'}</div>
            <div className="bubble">{m.content}</div>
          </div>
        ))}

        {pending && (
          <div className="msg ai">
            <div className="ava">AI</div>
            <div className="bubble">
              <span className="typing"><span></span><span></span><span></span></span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {err && (
        <div style={{ padding: '8px 18px', fontSize: 13, color: 'var(--danger)', background: '#fbeaec' }}>
          {err}
        </div>
      )}

      <form onSubmit={submit} className="chat-input">
        <input
          ref={inputRef}
          type="text"
          name="text"
          placeholder="Ask about this week's concepts…"
          disabled={pending}
          autoFocus
          style={{ flex: 1 }}
        />
        <button type="submit" disabled={pending} className="btn">
          Send
        </button>
      </form>
    </div>
  );
}
