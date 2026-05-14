import { pool } from './db';
import { getClaude, DEFAULT_MODEL } from './anthropic';

export interface ChatMessage {
  id: string;
  role: 'student' | 'ai' | 'system';
  content: string;
  created_at: string;
}

export interface ChatScope {
  thisWeekConcepts: { name: string; description: string | null }[];
  recentConcepts: { name: string; description: string | null }[];
  weekNumber: number | null;
  className: string | null;
}

export async function loadOrCreateChatSession(studentId: string): Promise<{ id: string; classId: string | null }> {
  // Find an open free_chat session for this student
  const { rows } = await pool.query<{ id: string; class_id: string }>(
    `SELECT id, class_id FROM chat_sessions
      WHERE student_id = $1 AND mode = 'free_chat' AND ended_at IS NULL
      ORDER BY started_at DESC LIMIT 1`,
    [studentId],
  );
  if (rows[0]) return { id: rows[0].id, classId: rows[0].class_id };

  // Otherwise, create one — needs the student's class
  const { rows: enroll } = await pool.query<{ class_id: string }>(
    `SELECT class_id FROM enrollments
      WHERE student_id = $1 AND withdrawn_at IS NULL
      ORDER BY enrolled_at DESC LIMIT 1`,
    [studentId],
  );
  if (!enroll[0]) return { id: '', classId: null };

  const { rows: [created] } = await pool.query<{ id: string }>(
    `INSERT INTO chat_sessions (student_id, class_id, mode)
     VALUES ($1, $2, 'free_chat') RETURNING id`,
    [studentId, enroll[0].class_id],
  );
  return { id: created.id, classId: enroll[0].class_id };
}

export async function loadMessages(sessionId: string): Promise<ChatMessage[]> {
  if (!sessionId) return [];
  const { rows } = await pool.query<ChatMessage>(
    `SELECT id, role, content, created_at
       FROM chat_messages
      WHERE session_id = $1
      ORDER BY created_at ASC`,
    [sessionId],
  );
  return rows;
}

export async function loadScope(classId: string): Promise<ChatScope> {
  const { rows: [syl] } = await pool.query<{ id: string; current_week: number; display_name: string }>(
    `SELECT s.id, s.current_week, c.display_name
       FROM syllabi s
       JOIN classes c ON c.id = s.class_id
      WHERE s.class_id = $1 AND s.superseded_at IS NULL
      ORDER BY s.created_at DESC LIMIT 1`,
    [classId],
  );
  if (!syl) return { thisWeekConcepts: [], recentConcepts: [], weekNumber: null, className: null };

  const { rows: thisWeek } = await pool.query<{ name: string; description: string | null }>(
    `SELECT name, description FROM concepts
      WHERE syllabus_id = $1 AND week_introduced = $2
      ORDER BY sequence_order`,
    [syl.id, syl.current_week],
  );
  const { rows: recent } = await pool.query<{ name: string; description: string | null }>(
    `SELECT name, description FROM concepts
      WHERE syllabus_id = $1 AND week_introduced < $2 AND week_introduced >= $2 - 2
      ORDER BY sequence_order`,
    [syl.id, syl.current_week],
  );

  return {
    thisWeekConcepts: thisWeek,
    recentConcepts: recent,
    weekNumber: syl.current_week,
    className: syl.display_name,
  };
}

export async function chatTurn(opts: {
  sessionId: string;
  studentId: string;
  studentName: string;
  classId: string;
  studentText: string;
}): Promise<{ ok: true; aiText: string } | { ok: false; error: string }> {
  const text = opts.studentText.trim();
  if (!text) return { ok: false, error: 'Empty message' };
  if (text.length > 2000) return { ok: false, error: 'Message too long (max 2000 chars).' };

  const scope = await loadScope(opts.classId);

  // Insert student message
  await pool.query(
    `INSERT INTO chat_messages (session_id, role, content) VALUES ($1, 'student', $2)`,
    [opts.sessionId, text],
  );

  // Build prompt — scope-constrained tutor
  const scopeBullets = (s: { name: string; description: string | null }[]) =>
    s.length ? s.map(c => `  - ${c.name}${c.description ? `: ${c.description}` : ''}`).join('\n') : '  (none)';

  const system = `You are TCS Tutor talking with ${opts.studentName}, a Grade 7 student.

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

  // Load up to last 20 messages for context
  const { rows: history } = await pool.query<{ role: string; content: string }>(
    `SELECT role, content FROM chat_messages
      WHERE session_id = $1
      ORDER BY created_at ASC LIMIT 20`,
    [opts.sessionId],
  );

  const claude = getClaude();
  try {
    const response = await claude.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 600,
      system,
      messages: history.map(m => ({
        role: m.role === 'student' ? 'user' : 'assistant',
        content: m.content,
      })),
    });

    const aiText = response.content
      .filter((b): b is import('@anthropic-ai/sdk').Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('')
      .trim();

    if (!aiText) return { ok: false, error: 'No response from AI.' };

    await pool.query(
      `INSERT INTO chat_messages (session_id, role, content) VALUES ($1, 'ai', $2)`,
      [opts.sessionId, aiText],
    );
    return { ok: true, aiText };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
