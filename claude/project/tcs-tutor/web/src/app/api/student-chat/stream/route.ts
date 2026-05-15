import { NextResponse, type NextRequest } from 'next/server';
import { getTutorUser } from '@/lib/tutor/role';
import { loadOrCreateChatSession, loadScope } from '@/lib/tutor/chat';
import { pool } from '@/lib/tutor/db';
import { getClaude, DEFAULT_MODEL } from '@/lib/tutor/anthropic';

/**
 * SSE-streaming chat endpoint. Client POSTs { text }, we stream back
 * "data: { delta: '<token>' }\n\n" frames as Claude produces them, then
 * a "data: { done: true }\n\n" terminator. Final AI message is persisted
 * to chat_messages after the stream completes so the next page load
 * shows the conversation.
 */
export async function POST(req: NextRequest) {
  const user = await getTutorUser();
  if (!user || user.role !== 'student') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as { text?: string };
  const text = (body.text ?? '').trim();
  if (!text) return NextResponse.json({ error: 'Empty message' }, { status: 400 });
  if (text.length > 2000) return NextResponse.json({ error: 'Message too long' }, { status: 400 });

  const session = await loadOrCreateChatSession(user.id);
  if (!session.id || !session.classId) {
    return NextResponse.json({ error: 'Not enrolled' }, { status: 400 });
  }

  const scope = await loadScope(session.classId);

  // Persist the student message immediately
  await pool.query(
    `INSERT INTO chat_messages (session_id, role, content) VALUES ($1, 'student', $2)`,
    [session.id, text],
  );

  // Load history (now including the message we just inserted)
  const { rows: history } = await pool.query<{ role: string; content: string }>(
    `SELECT role, content FROM chat_messages
      WHERE session_id = $1
      ORDER BY created_at ASC LIMIT 20`,
    [session.id],
  );

  const scopeBullets = (s: { name: string; description: string | null }[]) =>
    s.length ? s.map(c => `  - ${c.name}${c.description ? `: ${c.description}` : ''}`).join('\n') : '  (none)';

  const system = `You are TCS Tutor talking with ${user.display_name}, a Grade 7 student.

You are a SCOPED tutor — you only help with the concepts the student is currently studying, not arbitrary topics. Class: ${scope.className ?? 'unknown'}, currently in Week ${scope.weekNumber ?? '?'}.

CURRENT WEEK (your primary focus):
${scopeBullets(scope.thisWeekConcepts)}

RECENT WEEKS (you can also help here):
${scopeBullets(scope.recentConcepts)}

How you teach:
- Be warm, brief, and student-appropriate (Grade 7 reading level).
- NEVER just give the answer. Ask leading questions. Wait for the student to try.
- If a student asks for a direct answer to a homework / test question, redirect: ask them to share what they've tried first.
- Use short messages. 2-4 short sentences max per turn unless asked to go deeper.
- Use concrete examples; avoid jargon unless you've defined it.
- If asked about something outside scope (e.g. Math, video games, ChatGPT), gently say it's outside what you can help with today and offer to redirect to the current concepts.

You can use markdown for formatting (lists, **bold**, etc.).`;

  const claude = getClaude();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      let collected = '';
      try {
        const anthropicStream = claude.messages.stream({
          model: DEFAULT_MODEL,
          max_tokens: 600,
          system,
          messages: history.map(m => ({
            role: (m.role === 'student' ? 'user' : 'assistant') as 'user' | 'assistant',
            content: m.content,
          })),
        });

        for await (const event of anthropicStream) {
          if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
            const piece = (event.delta as { text?: string }).text ?? '';
            collected += piece;
            send({ delta: piece });
          }
        }

        // Persist final AI message
        if (collected.trim()) {
          await pool.query(
            `INSERT INTO chat_messages (session_id, role, content) VALUES ($1, 'ai', $2)`,
            [session.id, collected],
          );
        }
        send({ done: true });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[chat stream] failed:', err);
        send({ error: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
