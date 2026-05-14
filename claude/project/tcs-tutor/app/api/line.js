import crypto from 'node:crypto';
import { pool } from '../lib/db.js';
import { pickNextConcept, pickNextQuestion, recordAttempt } from '../services/mastery-engine.js';

const LINE_API = 'https://api.line.me/v2/bot';
const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET;
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const DRY_RUN = process.env.LINE_API_DRY_RUN === 'true';

if (!LINE_CHANNEL_SECRET && !DRY_RUN) {
  console.warn('LINE_CHANNEL_SECRET not set — webhook signature verification will fail.');
}

// ──────────────────────────────────────────────────────────────────────────
// Express handler — verify signature, ack immediately, process events async.
// LINE requires a 200 response within ~10s, so we don't await event handling.
// ──────────────────────────────────────────────────────────────────────────

export async function handleLineWebhook(req, res) {
  const raw = req.body;
  if (!Buffer.isBuffer(raw)) {
    res.status(400).send('expected raw body');
    return;
  }
  const signature = req.headers['x-line-signature'];
  if (!verifySignature(raw, signature)) {
    res.status(403).send('invalid signature');
    return;
  }

  let body;
  try { body = JSON.parse(raw.toString('utf8')); }
  catch { res.status(400).send('invalid json'); return; }

  res.status(200).send('ok');

  for (const event of (body.events ?? [])) {
    Promise.resolve()
      .then(() => handleEvent(event))
      .catch(err => console.error(`[LINE] event handling failed (${event.type}):`, err));
  }
}

function verifySignature(rawBody, signature) {
  if (!signature || !LINE_CHANNEL_SECRET) return false;
  const computed = crypto.createHmac('sha256', LINE_CHANNEL_SECRET).update(rawBody).digest('base64');
  const a = Buffer.from(computed);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ──────────────────────────────────────────────────────────────────────────
// Event router
// ──────────────────────────────────────────────────────────────────────────

async function handleEvent(event) {
  if (event.type === 'follow') return onFollow(event);
  if (event.type === 'unfollow') return onUnfollow(event);
  if (event.type === 'message' && event.message?.type === 'text') return onText(event);
  if (event.type === 'postback') return onPostback(event);
  // Other event types (sticker, image, location) are silently ignored.
}

async function onFollow(event) {
  const student = await findStudentByLineId(event.source?.userId);
  if (!student) {
    return reply(event.replyToken, [text(NOT_ENROLLED, { quickReply: modeQuickReply() })]);
  }
  return reply(event.replyToken, [
    text(`Hi ${student.display_name}! Ready to practice?`, { quickReply: modeQuickReply() })
  ]);
}

async function onUnfollow(event) {
  // Just close any open sessions for the user. We don't delete their row —
  // that requires teacher action through the dashboard.
  const lineUserId = event.source?.userId;
  if (!lineUserId) return;
  await pool.query(
    `UPDATE chat_sessions cs SET ended_at = now()
       FROM users u
      WHERE cs.student_id = u.id AND u.line_user_id = $1 AND cs.ended_at IS NULL`,
    [lineUserId]
  );
}

async function onText(event) {
  const student = await findStudentByLineId(event.source?.userId);
  if (!student) {
    return reply(event.replyToken, [text(NOT_ENROLLED)]);
  }
  const t = event.message.text.trim().toLowerCase();
  if (t === 'review' || t === 'practice')     return startSession(event.replyToken, student, 'review');
  if (t === 'preview')                        return startSession(event.replyToken, student, 'preview');
  if (t === 'exam prep' || t === 'exam')      return startSession(event.replyToken, student, 'exam_prep');
  if (t === 'stop' || t === 'quit' || t === 'bye') return endSession(event.replyToken, student);
  return reply(event.replyToken, [
    text("I'm here to help you practice. What would you like to do?", { quickReply: modeQuickReply() })
  ]);
}

async function onPostback(event) {
  const student = await findStudentByLineId(event.source?.userId);
  if (!student) {
    return reply(event.replyToken, [text(NOT_ENROLLED)]);
  }
  const data = parseQS(event.postback?.data ?? '');
  switch (data.action) {
    case 'mode':   return startSession(event.replyToken, student, data.mode);
    case 'answer': return recordAndContinue(event.replyToken, student, data.qid, data.letter, data.session);
    case 'next':   return sendNextQuestion(event.replyToken, student, data.session);
    case 'flag':   return flagQuestion(event.replyToken, student, data.qid, data.session);
    case 'stop':   return endSession(event.replyToken, student);
    default:       return reply(event.replyToken, [text('I didn\'t catch that — what would you like to do?', { quickReply: modeQuickReply() })]);
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Session flow
// ──────────────────────────────────────────────────────────────────────────

async function startSession(replyToken, student, mode) {
  if (!['review', 'preview', 'exam_prep'].includes(mode)) mode = 'review';

  const klass = await findEnrollment(student.id);
  if (!klass) {
    return reply(replyToken, [text("You're not enrolled in a class yet. Please ask your teacher.")]);
  }

  await pool.query(
    `UPDATE chat_sessions SET ended_at = now() WHERE student_id = $1 AND ended_at IS NULL`,
    [student.id]
  );
  const { rows: [session] } = await pool.query(
    `INSERT INTO chat_sessions (student_id, class_id, mode) VALUES ($1, $2, $3) RETURNING id`,
    [student.id, klass.class_id, mode]
  );

  return sendNextQuestion(replyToken, student, session.id);
}

async function sendNextQuestion(replyToken, student, sessionId) {
  const session = await fetchSession(sessionId, student.id);
  if (!session) {
    return reply(replyToken, [text("Your session expired — let's start fresh.", { quickReply: modeQuickReply() })]);
  }
  const syllabus = await findSyllabusForClass(session.class_id);
  if (!syllabus) {
    return reply(replyToken, [text("Your teacher hasn't uploaded a syllabus yet — practice will be available once they do.")]);
  }

  const concept = await pickNextConcept({
    studentId: student.id,
    syllabusId: syllabus.id,
    mode: session.mode,
    currentWeek: syllabus.current_week
  });

  if (!concept) {
    await pool.query(`UPDATE chat_sessions SET ended_at = now() WHERE id = $1`, [sessionId]);
    return reply(replyToken, [
      text("Nothing new to practice right now — great job staying on top of things!", { quickReply: modeQuickReply() })
    ]);
  }

  const question = await pickNextQuestion({ studentId: student.id, conceptId: concept.conceptId });
  if (!question) {
    return reply(replyToken, [text(`No questions available for "${concept.name}" yet — your teacher is preparing them.`, { quickReply: modeQuickReply() })]);
  }

  await pool.query(
    `INSERT INTO chat_messages (session_id, role, content, question_id, metadata)
     VALUES ($1, 'ai', $2, $3, $4)`,
    [sessionId, question.body, question.id, JSON.stringify({ concept_code: concept.code })]
  );

  return reply(replyToken, [formatQuestionMessage(concept, question, sessionId)]);
}

async function recordAndContinue(replyToken, student, questionId, letter, sessionId) {
  if (!/^[A-D]$/.test(letter || '')) {
    return reply(replyToken, [text("That answer didn't look right — please tap A, B, C, or D.")]);
  }
  let result;
  try {
    result = await recordAttempt({
      studentId: student.id,
      questionId,
      answerLetter: letter,
      sessionId
    });
  } catch (err) {
    console.error('[LINE] recordAttempt failed:', err.message);
    return reply(replyToken, [text("Something went wrong saving your answer. Let's try the next one.", { quickReply: continueQuickReply(sessionId, questionId) })]);
  }

  const { rows: [q] } = await pool.query(
    `SELECT correct_letter, explanation FROM questions WHERE id = $1`,
    [questionId]
  );
  if (!q) {
    return reply(replyToken, [text("Question not found — let's continue.", { quickReply: continueQuickReply(sessionId, questionId) })]);
  }

  const heading = result.isCorrect
    ? '✓ Correct!'
    : `✗ Not quite — the answer was ${q.correct_letter}.`;
  const deltaSign = result.masteryAfter >= result.masteryBefore ? '+' : '';
  const masteryLine = `Mastery: ${result.masteryBefore} → ${result.masteryAfter} (${deltaSign}${result.masteryAfter - result.masteryBefore})`;
  const body = `${heading}\n\n${q.explanation}\n\n${masteryLine}`;

  await pool.query(
    `INSERT INTO chat_messages (session_id, role, content, question_id, metadata)
     VALUES ($1, 'student', $2, $3, $4)`,
    [
      sessionId, letter, questionId,
      JSON.stringify({ is_correct: result.isCorrect, mastery_before: result.masteryBefore, mastery_after: result.masteryAfter })
    ]
  );

  return reply(replyToken, [text(body, { quickReply: continueQuickReply(sessionId, questionId) })]);
}

async function flagQuestion(replyToken, student, questionId, sessionId) {
  await pool.query(
    `INSERT INTO flagged_items (question_id, flagger_user_id, flagger_role, reason)
     VALUES ($1, $2, 'student', 'Flagged from LINE bot')`,
    [questionId, student.id]
  );
  return reply(replyToken, [
    text("Thanks for flagging — your teacher will review this question. Want to keep going?", { quickReply: continueQuickReply(sessionId, questionId, { skipFlag: true }) })
  ]);
}

async function endSession(replyToken, student) {
  await pool.query(
    `UPDATE chat_sessions SET ended_at = now() WHERE student_id = $1 AND ended_at IS NULL`,
    [student.id]
  );
  return reply(replyToken, [text("Thanks for practicing! See you next time.", { quickReply: modeQuickReply() })]);
}

// ──────────────────────────────────────────────────────────────────────────
// Message helpers
// ──────────────────────────────────────────────────────────────────────────

const NOT_ENROLLED = "Welcome! Your account isn't connected to a class yet. Please ask your teacher to enroll you.";

function text(content, { quickReply } = {}) {
  const m = { type: 'text', text: content };
  if (quickReply) m.quickReply = quickReply;
  return m;
}

function formatQuestionMessage(concept, question, sessionId) {
  const optionsList = question.options
    .map(o => `${o.letter}) ${o.text}`)
    .join('\n');
  const body = `[${concept.name}]  ·  Difficulty ${question.difficulty}/5\n\n${question.body}\n\n${optionsList}`;
  return text(body, { quickReply: answerQuickReply(question, sessionId) });
}

function answerQuickReply(question, sessionId) {
  const buttons = question.options.map(o => ({
    type: 'action',
    action: {
      type: 'postback',
      label: o.letter,
      data: `action=answer&qid=${question.id}&letter=${o.letter}&session=${sessionId}`,
      displayText: o.letter
    }
  }));
  buttons.push({
    type: 'action',
    action: {
      type: 'postback',
      label: '⚑ Flag',
      data: `action=flag&qid=${question.id}&session=${sessionId}`,
      displayText: 'Flag this question'
    }
  });
  return { items: buttons };
}

function continueQuickReply(sessionId, questionId, opts = {}) {
  const items = [
    { type: 'action', action: { type: 'postback', label: 'Next →', data: `action=next&session=${sessionId}`, displayText: 'Next' } }
  ];
  if (!opts.skipFlag && questionId) {
    items.push({ type: 'action', action: { type: 'postback', label: '⚑ Flag', data: `action=flag&qid=${questionId}&session=${sessionId}`, displayText: 'Flag this question' } });
  }
  items.push({ type: 'action', action: { type: 'postback', label: 'Stop', data: 'action=stop', displayText: 'Stop' } });
  return { items };
}

function modeQuickReply() {
  return {
    items: [
      { type: 'action', action: { type: 'postback', label: 'Review',    data: 'action=mode&mode=review',    displayText: 'Review' } },
      { type: 'action', action: { type: 'postback', label: 'Preview',   data: 'action=mode&mode=preview',   displayText: 'Preview' } },
      { type: 'action', action: { type: 'postback', label: 'Exam Prep', data: 'action=mode&mode=exam_prep', displayText: 'Exam prep' } }
    ]
  };
}

// ──────────────────────────────────────────────────────────────────────────
// LINE API client — dry-run mode logs instead of POSTing
// ──────────────────────────────────────────────────────────────────────────

async function reply(replyToken, messages) {
  if (DRY_RUN) {
    console.log('[LINE dry-run]', JSON.stringify({ replyToken, messages }, null, 2));
    return;
  }
  if (!LINE_CHANNEL_ACCESS_TOKEN) {
    throw new Error('LINE_CHANNEL_ACCESS_TOKEN not set');
  }
  const res = await fetch(`${LINE_API}/message/reply`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
    },
    body: JSON.stringify({ replyToken, messages })
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`LINE reply failed: ${res.status} ${errBody}`);
  }
}

// ──────────────────────────────────────────────────────────────────────────
// DB helpers
// ──────────────────────────────────────────────────────────────────────────

async function findStudentByLineId(lineUserId) {
  if (!lineUserId) return null;
  const { rows } = await pool.query(
    `SELECT id, display_name, preferred_lang
       FROM users
      WHERE line_user_id = $1 AND role = 'student' AND archived_at IS NULL`,
    [lineUserId]
  );
  return rows[0] ?? null;
}

async function findEnrollment(studentId) {
  const { rows } = await pool.query(
    `SELECT class_id FROM enrollments
      WHERE student_id = $1 AND withdrawn_at IS NULL
      ORDER BY enrolled_at DESC LIMIT 1`,
    [studentId]
  );
  return rows[0] ?? null;
}

async function findSyllabusForClass(classId) {
  const { rows } = await pool.query(
    `SELECT id, current_week FROM syllabi
      WHERE class_id = $1 AND superseded_at IS NULL
      ORDER BY created_at DESC LIMIT 1`,
    [classId]
  );
  return rows[0] ?? null;
}

async function fetchSession(sessionId, studentId) {
  if (!sessionId) return null;
  const { rows } = await pool.query(
    `SELECT id, class_id, mode, ended_at FROM chat_sessions
      WHERE id = $1 AND student_id = $2`,
    [sessionId, studentId]
  );
  const row = rows[0];
  if (!row || row.ended_at) return null;
  return row;
}

function parseQS(s) {
  const out = {};
  for (const pair of String(s).split('&')) {
    if (!pair) continue;
    const i = pair.indexOf('=');
    const k = decodeURIComponent(i < 0 ? pair : pair.slice(0, i));
    const v = i < 0 ? '' : decodeURIComponent(pair.slice(i + 1));
    out[k] = v;
  }
  return out;
}
