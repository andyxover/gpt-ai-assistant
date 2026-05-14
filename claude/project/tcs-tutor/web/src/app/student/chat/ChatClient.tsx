'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { sendChat } from './actions';
import type { ChatMessage } from '@/lib/tutor/chat';

export default function ChatClient(props: {
  initialMessages: ChatMessage[];
  scopeLabel: string | null;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(props.initialMessages);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
    <div className="flex flex-col h-[calc(100vh-6rem)] max-h-[800px]">
      <header className="px-1 pb-3 border-b border-stone-200">
        <h1 className="text-2xl font-bold">Ask the tutor</h1>
        {props.scopeLabel && (
          <p className="text-xs text-stone-500 mt-1">
            Scope:{' '}
            <span className="text-[#a86a36]">{props.scopeLabel}</span>
          </p>
        )}
      </header>

      <div className="flex-1 overflow-y-auto py-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-stone-500 text-sm py-12 max-w-md mx-auto">
            <p className="mb-2">Hi! I&apos;m your tutor. Ask me anything about this week&apos;s concepts.</p>
            <p className="text-xs text-stone-400">
              I won&apos;t just give you answers — I&apos;ll help you think through them.
            </p>
          </div>
        )}

        {messages.map(m => (
          <div key={m.id} className={`flex ${m.role === 'student' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap leading-relaxed ${
                m.role === 'student'
                  ? 'bg-[#c9874a] text-white'
                  : 'bg-white border border-stone-200 text-stone-800'
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}

        {pending && (
          <div className="flex justify-start">
            <div className="bg-white border border-stone-200 text-stone-500 text-sm px-4 py-2.5 rounded-2xl">
              <span className="inline-flex gap-1">
                <span className="w-1.5 h-1.5 bg-stone-400 rounded-full animate-pulse"></span>
                <span className="w-1.5 h-1.5 bg-stone-400 rounded-full animate-pulse" style={{ animationDelay: '150ms' }}></span>
                <span className="w-1.5 h-1.5 bg-stone-400 rounded-full animate-pulse" style={{ animationDelay: '300ms' }}></span>
              </span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {err && <p className="text-sm text-red-600 mb-2">{err}</p>}

      <form onSubmit={submit} className="flex gap-2 pt-3 border-t border-stone-200">
        <input
          ref={inputRef}
          type="text"
          name="text"
          placeholder="Ask about this week's concepts..."
          disabled={pending}
          className="flex-1 px-4 py-2.5 border border-stone-300 rounded-lg focus:outline-none focus:border-[#c9874a]"
          autoFocus
        />
        <button
          type="submit"
          disabled={pending}
          className="px-5 py-2.5 rounded-lg bg-[#c9874a] hover:bg-[#a86a36] disabled:opacity-50 text-white font-medium"
        >
          Send
        </button>
      </form>
    </div>
  );
}
