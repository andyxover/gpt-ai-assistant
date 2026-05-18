'use client';

import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatMessage } from '@/lib/tutor/chat';

// Override default react-markdown components so paragraphs / lists
// don't blow out the chat bubble with default browser margins.
const MD_COMPONENTS = {
  p: (p: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p style={{ margin: '0 0 8px' }} {...p} />
  ),
  ul: (p: React.HTMLAttributes<HTMLUListElement>) => (
    <ul style={{ margin: '0 0 8px', paddingLeft: 22 }} {...p} />
  ),
  ol: (p: React.HTMLAttributes<HTMLOListElement>) => (
    <ol style={{ margin: '0 0 8px', paddingLeft: 22 }} {...p} />
  ),
  li: (p: React.HTMLAttributes<HTMLLIElement>) => (
    <li style={{ margin: '0 0 2px' }} {...p} />
  ),
  h1: (p: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h3 style={{ margin: '8px 0 6px', fontSize: 15 }} {...p} />
  ),
  h2: (p: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h3 style={{ margin: '8px 0 6px', fontSize: 15 }} {...p} />
  ),
  h3: (p: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h3 style={{ margin: '8px 0 6px', fontSize: 14 }} {...p} />
  ),
  strong: (p: React.HTMLAttributes<HTMLElement>) => (
    <strong style={{ fontWeight: 600 }} {...p} />
  ),
};

export default function ChatClient(props: {
  initialMessages: ChatMessage[];
  scopeLabel: string | null;
  studentInitial: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(props.initialMessages);
  const [streamingText, setStreamingText] = useState<string>(''); // live AI reply being written
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, pending, streamingText]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const formEl = e.currentTarget;
    const formData = new FormData(formEl);
    const text = String(formData.get('text') ?? '').trim();
    if (!text) return;

    const optimisticUser: ChatMessage = {
      id: `tmp-${Date.now()}`,
      role: 'student',
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, optimisticUser]);
    if (inputRef.current) inputRef.current.value = '';
    setErr(null);
    setStreamingText('');
    setPending(true);

    try {
      const res = await fetch('/api/student-chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok || !res.body) {
        const body = await res.text().catch(() => '');
        throw new Error(body || `${res.status} ${res.statusText}`);
      }

      // Consume SSE: each event is "data: {json}\n\n"
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let collected = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const frames = buf.split('\n\n');
        buf = frames.pop() ?? '';
        for (const frame of frames) {
          const line = frame.trim();
          if (!line.startsWith('data:')) continue;
          const payload = JSON.parse(line.slice(5).trim()) as { delta?: string; done?: boolean; error?: string };
          if (payload.error) {
            throw new Error(payload.error);
          }
          if (payload.delta) {
            collected += payload.delta;
            setStreamingText(collected);
          }
          if (payload.done) break;
        }
      }

      // Append the final AI message to the list, clear streaming buffer
      if (collected) {
        const finalAi: ChatMessage = {
          id: `ai-${Date.now()}`,
          role: 'ai',
          content: collected,
          created_at: new Date().toISOString(),
        };
        setMessages(prev => [...prev, finalAi]);
      }
    } catch (error) {
      setErr(error instanceof Error ? error.message : String(error));
    } finally {
      setStreamingText('');
      setPending(false);
    }
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
            <div
              className="bubble"
              style={{ whiteSpace: m.role === 'ai' ? 'normal' : 'pre-wrap' }}
            >
              {m.role === 'ai' ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
                  {m.content}
                </ReactMarkdown>
              ) : (
                m.content
              )}
            </div>
          </div>
        ))}

        {pending && (
          <div className="msg ai">
            <div className="ava">AI</div>
            <div className="bubble" style={{ whiteSpace: 'normal' }}>
              {streamingText ? (
                <>
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
                    {streamingText}
                  </ReactMarkdown>
                  <span
                    aria-hidden
                    style={{
                      display: 'inline-block',
                      width: 8,
                      height: 14,
                      marginLeft: 2,
                      verticalAlign: 'text-bottom',
                      background: 'var(--text)',
                      opacity: 0.55,
                      animation: 'skShimmer 0.8s ease-in-out infinite',
                    }}
                  />
                </>
              ) : (
                <span className="typing"><span></span><span></span><span></span></span>
              )}
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
