#!/usr/bin/env node
// Render the weekly parent report against data populated by simulate-session.js.
//
// Usage:
//   node cli/render-report.js [options]
//
// Options:
//   --student <id>          Student UUID (default: demo student)
//   --class <id>            Class UUID (default: demo class)
//   --week <n>              Week number (default: 5)
//   --week-start <date>     ISO date of Monday of that week (default: today minus current weekday)
//   --lang <en|zh>          Language (default: en)
//   --persist               Insert/upsert into parent_reports
//   --html-out <path>       Write rendered HTML to this path (default: /tmp/tcs-report.html)
//   --skip-narrative        Use the deterministic fallback narrative (free, no API call)

import '../lib/env.js';
import { writeFileSync } from 'node:fs';
import { pool, close } from '../lib/db.js';
import { renderWeeklyReport } from '../services/report-renderer.js';

const DEMO_STUDENT = '00000000-0000-0000-0000-000000000020';
const DEMO_CLASS   = '00000000-0000-0000-0000-000000000100';

const args = parseArgs(process.argv.slice(2));

try {
  await main();
} catch (err) {
  console.error('\nReport rendering failed:');
  console.error(err.stack ?? err.message);
  process.exitCode = 2;
} finally {
  await close();
}

async function main() {
  const start = Date.now();
  console.log(`▸ Rendering Week ${args.week} report for student ${args.student.slice(0, 8)}... (${args.lang})`);

  const { snapshot, rendered, costUSD } = await renderWeeklyReport({
    studentId: args.student,
    classId: args.class,
    weekNumber: args.week,
    weekStartDate: args.weekStart,
    lang: args.lang,
    skipNarrative: args.skipNarrative
  });

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log('\n─── Plain text rendering ─────────────────────────────');
  console.log(rendered.plainText);

  writeFileSync(args.htmlOut, rendered.html, 'utf8');
  console.log(`\nHTML written to: ${args.htmlOut}`);

  if (args.persist) {
    await pool.query(
      `INSERT INTO parent_reports (student_id, class_id, week_number, week_starts, snapshot)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (student_id, week_number, class_id) DO UPDATE SET
         snapshot = EXCLUDED.snapshot,
         week_starts = EXCLUDED.week_starts`,
      [args.student, args.class, args.week, args.weekStart, snapshot]
    );
    console.log(`Snapshot upserted into parent_reports (week ${args.week}).`);
  }

  console.log(`\nCost: $${costUSD.toFixed(4)} · Elapsed: ${elapsed}s`);
}

// ──────────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = {
    student: DEMO_STUDENT,
    class: DEMO_CLASS,
    week: 5,
    weekStart: defaultMonday(),
    lang: 'en',
    persist: false,
    htmlOut: '/tmp/tcs-report.html',
    skipNarrative: false
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--persist') out.persist = true;
    else if (a === '--skip-narrative') out.skipNarrative = true;
    else if (a === '--student') out.student = argv[++i];
    else if (a === '--class') out.class = argv[++i];
    else if (a === '--week') out.week = Number(argv[++i]);
    else if (a === '--week-start') out.weekStart = argv[++i];
    else if (a === '--lang') out.lang = argv[++i];
    else if (a === '--html-out') out.htmlOut = argv[++i];
    else if (a.startsWith('--')) { console.error(`Unknown option: ${a}`); process.exit(1); }
    else { console.error(`Unexpected positional: ${a}`); process.exit(1); }
  }
  if (!['en', 'zh'].includes(out.lang)) {
    console.error(`--lang must be 'en' or 'zh' (got "${out.lang}")`);
    process.exit(1);
  }
  return out;
}

function defaultMonday() {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}
