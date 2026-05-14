#!/usr/bin/env node
// Send a fake LINE webhook event to the local server. Useful for verifying
// the bot logic without a real LINE channel.
//
// Prereq: start the server in another terminal with LINE_API_DRY_RUN=true.
//
// Usage:
//   node cli/replay-webhook.js follow [--user-id <line-user-id>]
//   node cli/replay-webhook.js text   <message>   [--user-id ...]
//   node cli/replay-webhook.js answer <qid> <letter> <session> [--user-id ...]
//   node cli/replay-webhook.js mode   <review|preview|exam_prep> [--user-id ...]
//   node cli/replay-webhook.js next   <session>                  [--user-id ...]
//   node cli/replay-webhook.js flag   <qid> <session>            [--user-id ...]
//   node cli/replay-webhook.js stop                              [--user-id ...]
//
// Examples (assuming demo student's line_user_id was set to U_DEMO):
//   node cli/replay-webhook.js text "review" --user-id U_DEMO
//   node cli/replay-webhook.js mode review --user-id U_DEMO

import '../lib/env.js';
import crypto from 'node:crypto';

const SECRET = process.env.LINE_CHANNEL_SECRET;
if (!SECRET) {
  console.error('LINE_CHANNEL_SECRET not set in .env — required to compute the webhook signature.');
  process.exit(1);
}

const args = parseArgs(process.argv.slice(2));
const port = Number(process.env.PORT) || 3000;
const userId = args.userId || 'U_DEMO';

const events = [buildEvent(args, userId)];
const body = JSON.stringify({ destination: 'TEST', events });
const signature = crypto.createHmac('sha256', SECRET).update(body).digest('base64');

const url = `http://localhost:${port}/webhook/line`;
console.log(`POST ${url}`);
console.log(`  event: ${args.command}  source.userId: ${userId}`);

const res = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Line-Signature': signature },
  body
});
console.log(`  → ${res.status} ${res.statusText}`);
const respBody = await res.text();
if (respBody) console.log(`  body: ${respBody}`);
console.log('\nCheck the server console for the bot\'s reply (dry-run mode logs it).');

// ──────────────────────────────────────────────────────────────────────────

function buildEvent({ command, positional }, userId) {
  const replyToken = `replay-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const source = { type: 'user', userId };

  if (command === 'follow') {
    return { type: 'follow', source, replyToken, timestamp: Date.now() };
  }
  if (command === 'text') {
    const text = positional.join(' ');
    if (!text) bail('text command needs a message argument');
    return { type: 'message', source, replyToken, timestamp: Date.now(),
             message: { type: 'text', id: 'm1', text } };
  }
  if (command === 'mode') {
    const mode = positional[0];
    if (!['review', 'preview', 'exam_prep'].includes(mode)) bail(`mode must be one of: review, preview, exam_prep`);
    return { type: 'postback', source, replyToken, timestamp: Date.now(),
             postback: { data: `action=mode&mode=${mode}` } };
  }
  if (command === 'answer') {
    const [qid, letter, session] = positional;
    if (!qid || !letter || !session) bail('answer needs <qid> <letter> <session>');
    return { type: 'postback', source, replyToken, timestamp: Date.now(),
             postback: { data: `action=answer&qid=${qid}&letter=${letter}&session=${session}` } };
  }
  if (command === 'next') {
    const [session] = positional;
    if (!session) bail('next needs <session>');
    return { type: 'postback', source, replyToken, timestamp: Date.now(),
             postback: { data: `action=next&session=${session}` } };
  }
  if (command === 'flag') {
    const [qid, session] = positional;
    if (!qid || !session) bail('flag needs <qid> <session>');
    return { type: 'postback', source, replyToken, timestamp: Date.now(),
             postback: { data: `action=flag&qid=${qid}&session=${session}` } };
  }
  if (command === 'stop') {
    return { type: 'postback', source, replyToken, timestamp: Date.now(),
             postback: { data: 'action=stop' } };
  }
  bail(`unknown command: ${command}`);
}

function parseArgs(argv) {
  const out = { command: null, positional: [], userId: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--user-id') out.userId = argv[++i];
    else if (a.startsWith('--')) bail(`unknown option: ${a}`);
    else if (!out.command) out.command = a;
    else out.positional.push(a);
  }
  if (!out.command) bail('command required (follow | text | mode | answer | next | flag | stop)');
  return out;
}

function bail(msg) {
  console.error(`Error: ${msg}`);
  process.exit(1);
}
