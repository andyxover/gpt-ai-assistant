#!/usr/bin/env node
// End-to-end simulation: seeds a demo class + student + syllabus, generates
// a small validated question pool, then runs a simulated student session
// against the mastery engine. Prints the per-attempt trajectory and a
// final mastery table.
//
// Usage:
//   node cli/simulate-session.js <syllabus-file> [options]
//
// Options:
//   --concepts <n>                Concepts to generate content for (default: 3)
//   --questions-per-concept <n>   Questions per concept (default: 4)
//   --rounds <n>                  Simulated attempt rounds (default: 20)
//   --reuse-questions             Don't regenerate if questions already exist
//   --current-week <n>            Pretend the class is on this week (default: 5)
//
// Example:
//   node cli/simulate-session.js samples/science-7-syllabus.txt \
//     --concepts 3 --rounds 25
//
// Re-running with the same syllabus reuses seeded entities. Pass
// --reuse-questions to skip regeneration if you've run it once already.

import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pool, query, tx, close } from '../lib/db.js';
import { parseSyllabus } from '../services/syllabus-parser.js';
import { generateQuestions } from '../services/question-generator.js';
import { validateQuestion } from '../services/question-validator.js';
import { pickNextConcept, pickNextQuestion, recordAttempt } from '../services/mastery-engine.js';

const DEMO = {
  schoolId:   '00000000-0000-0000-0000-000000000001',
  teacherId:  '00000000-0000-0000-0000-000000000010',
  studentId:  '00000000-0000-0000-0000-000000000020',
  classId:    '00000000-0000-0000-0000-000000000100',
  syllabusId: '00000000-0000-0000-0000-000000000200'
};

const args = parseArgs(process.argv.slice(2));
if (!args.input) {
  console.error('Usage: node cli/simulate-session.js <syllabus-file> [options]');
  process.exit(1);
}

let totalApiCost = 0;
const overallStart = Date.now();

try {
  await main();
} catch (err) {
  console.error('\nSimulation failed:');
  console.error(err.stack ?? err.message);
  process.exitCode = 2;
} finally {
  await close();
}

async function main() {
  // ────────────────────────────────────────────────────────────────
  // 1. Parse syllabus
  // ────────────────────────────────────────────────────────────────
  const raw = readFileSync(resolve(process.cwd(), args.input), 'utf8');
  console.log(`▸ Parsing syllabus (${args.input})...`);
  const { scope, costUSD: parseCost } = await parseSyllabus(raw);
  totalApiCost += parseCost;
  console.log(`  parsed, cost $${parseCost.toFixed(4)}\n`);

  // ────────────────────────────────────────────────────────────────
  // 2. Seed entities (idempotent)
  // ────────────────────────────────────────────────────────────────
  console.log('▸ Seeding demo entities...');
  await seedEntities(scope);
  const conceptRows = await seedConcepts(scope);
  console.log(`  ${conceptRows.length} concepts in DB for syllabus ${DEMO.syllabusId}\n`);

  // ────────────────────────────────────────────────────────────────
  // 3. Build question pool (skip safety-critical, cap at --concepts)
  // ────────────────────────────────────────────────────────────────
  const drillable = conceptRows
    .filter(c => !c.is_safety_critical)
    .filter(c => c.week_introduced <= args.currentWeek)
    .slice(0, args.concepts);

  if (drillable.length === 0) {
    throw new Error('No drillable (non-safety-critical, in-week) concepts found.');
  }

  console.log(`▸ Ensuring question pool for ${drillable.length} concepts...`);
  for (const c of drillable) {
    await ensureQuestionsFor(c, args.questionsPerConcept, args.reuseQuestions);
  }
  console.log();

  // ────────────────────────────────────────────────────────────────
  // 4. Open chat session
  // ────────────────────────────────────────────────────────────────
  const { rows: [session] } = await pool.query(
    `INSERT INTO chat_sessions (student_id, class_id, mode, started_at)
     VALUES ($1, $2, 'review', now())
     RETURNING id`,
    [DEMO.studentId, DEMO.classId]
  );

  // ────────────────────────────────────────────────────────────────
  // 5. Simulate
  // ────────────────────────────────────────────────────────────────
  console.log(`▸ Simulating ${args.rounds} attempts (mode=review, currentWeek=${args.currentWeek})...\n`);
  console.log(`  ${'idx'.padStart(4)}  ${'concept'.padEnd(28)} diff  mastery       result`);
  console.log(`  ${'-'.repeat(70)}`);

  let stuck = 0;
  for (let i = 1; i <= args.rounds; i += 1) {
    const concept = await pickNextConcept({
      studentId: DEMO.studentId,
      syllabusId: DEMO.syllabusId,
      mode: 'review',
      currentWeek: args.currentWeek
    });
    if (!concept) {
      console.log(`  [${String(i).padStart(2)}]  (no concept available — selector returned null)`);
      stuck += 1;
      if (stuck >= 3) break;
      continue;
    }

    const q = await pickNextQuestion({ studentId: DEMO.studentId, conceptId: concept.conceptId });
    if (!q) {
      console.log(`  [${String(i).padStart(2)}]  ${concept.code.padEnd(28)}  (no question in band — skipping)`);
      stuck += 1;
      continue;
    }
    stuck = 0;

    const answer = simulateAnswer(concept.masteryScore, q.difficulty, q.correct_letter);
    const result = await recordAttempt({
      studentId: DEMO.studentId,
      questionId: q.id,
      answerLetter: answer,
      sessionId: session.id
    });

    const change = result.masteryAfter - result.masteryBefore;
    const arrow = change >= 0 ? `+${change}` : `${change}`;
    const tag = result.isCorrect ? '✓' : '✗';
    console.log(
      `  [${String(i).padStart(2)}]  ${concept.code.padEnd(28)}  ${q.difficulty}    ` +
      `${String(result.masteryBefore).padStart(3)} → ${String(result.masteryAfter).padStart(3)} (${arrow.padStart(3)})  ${tag}`
    );
  }

  await pool.query(`UPDATE chat_sessions SET ended_at = now() WHERE id = $1`, [session.id]);

  // ────────────────────────────────────────────────────────────────
  // 6. Summary
  // ────────────────────────────────────────────────────────────────
  await printSummary(drillable);

  const elapsed = ((Date.now() - overallStart) / 1000).toFixed(1);
  console.log(`\nTotal API cost:  $${totalApiCost.toFixed(4)}`);
  console.log(`Total elapsed:   ${elapsed}s`);
}

// ──────────────────────────────────────────────────────────────────────────
// Seeding
// ──────────────────────────────────────────────────────────────────────────

async function seedEntities(scope) {
  await tx(async (client) => {
    await client.query(
      `INSERT INTO users (id, school_id, role, display_name, preferred_lang)
       VALUES ($1, $2, 'teacher', $3, 'en')
       ON CONFLICT (id) DO NOTHING`,
      [DEMO.teacherId, DEMO.schoolId, scope.teacher?.name ?? 'Demo Teacher']
    );
    await client.query(
      `INSERT INTO users (id, school_id, role, display_name, preferred_lang)
       VALUES ($1, $2, 'student', 'Demo Student', 'en')
       ON CONFLICT (id) DO NOTHING`,
      [DEMO.studentId, DEMO.schoolId]
    );
    await client.query(
      `INSERT INTO classes (id, school_id, teacher_user_id, subject, grade, section, display_name, academic_year)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO NOTHING`,
      [
        DEMO.classId, DEMO.schoolId, DEMO.teacherId,
        scope.course?.subject ?? 'science',
        scope.course?.grade ?? 7,
        (scope.sections?.[0]) ?? '7A',
        scope.course?.name ?? 'Demo Class',
        '2025-26'
      ]
    );
    await client.query(
      `INSERT INTO enrollments (class_id, student_id)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [DEMO.classId, DEMO.studentId]
    );
    await client.query(
      `INSERT INTO syllabi (id, class_id, semester, raw_text, parsed_scope, current_week, uploaded_by_user_id, teacher_confirmed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now())
       ON CONFLICT (id) DO UPDATE SET parsed_scope = EXCLUDED.parsed_scope`,
      [
        DEMO.syllabusId, DEMO.classId,
        scope.course?.semester ?? 'S1',
        '(seeded by simulate-session.js)',
        JSON.stringify(scope),
        args.currentWeek,
        DEMO.teacherId
      ]
    );
  });
}

async function seedConcepts(scope) {
  let seq = 0;
  const flat = [];
  for (const chapter of (scope.chapters ?? [])) {
    for (const week of (chapter.weeks ?? [])) {
      const { from, to } = parseWk(week.wk);
      for (const c of (week.concepts ?? [])) {
        seq += 1;
        flat.push({
          code: c.code,
          name: c.name,
          chapter_title: chapter.title,
          week_introduced: from,
          week_last_taught: to,
          is_safety_critical: !!c.is_safety_critical,
          sequence_order: seq,
          description: week.topics?.length ? week.topics.join('; ') : null
        });
      }
    }
  }

  await tx(async (client) => {
    for (const c of flat) {
      await client.query(
        `INSERT INTO concepts (syllabus_id, code, name, chapter_title, week_introduced, week_last_taught, sequence_order, is_safety_critical, description)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (syllabus_id, code) DO UPDATE SET
           name = EXCLUDED.name,
           chapter_title = EXCLUDED.chapter_title,
           week_introduced = EXCLUDED.week_introduced,
           week_last_taught = EXCLUDED.week_last_taught,
           sequence_order = EXCLUDED.sequence_order,
           is_safety_critical = EXCLUDED.is_safety_critical,
           description = EXCLUDED.description`,
        [
          DEMO.syllabusId, c.code, c.name, c.chapter_title,
          c.week_introduced, c.week_last_taught, c.sequence_order,
          c.is_safety_critical, c.description
        ]
      );
    }
  });

  return query(
    `SELECT id, code, name, chapter_title, $1::int AS grade,
            week_introduced, is_safety_critical, description
       FROM concepts
      WHERE syllabus_id = $2
   ORDER BY sequence_order`,
    [scope.course?.grade ?? 7, DEMO.syllabusId]
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Question pool
// ──────────────────────────────────────────────────────────────────────────

async function ensureQuestionsFor(concept, count, reuseIfExists) {
  if (reuseIfExists) {
    const existing = await query(
      `SELECT COUNT(*)::int AS n FROM questions
        WHERE concept_id = $1 AND validation_status = 'approved' AND retired_at IS NULL`,
      [concept.id]
    );
    if (existing[0].n >= count) {
      console.log(`  ${concept.code.padEnd(28)}  reusing ${existing[0].n} existing approved Qs`);
      return;
    }
  }

  console.log(`  ${concept.code.padEnd(28)}  generating ${count} Qs...`);

  const gen = await generateQuestions(
    {
      name: concept.name,
      chapter_title: concept.chapter_title,
      grade: concept.grade,
      description: concept.description,
      is_safety_critical: concept.is_safety_critical
    },
    { count, difficulty_range: [1, 4] }
  );
  totalApiCost += gen.costUSD;

  let approved = 0;
  let rejected = 0;
  let needsReview = 0;

  for (const q of gen.questions) {
    const v = await validateQuestion(q, {
      name: concept.name,
      chapter_title: concept.chapter_title,
      grade: concept.grade,
      description: concept.description
    });
    totalApiCost += v.costUSD;

    if (v.decision === 'reject') { rejected += 1; continue; }
    if (v.decision === 'needs_review') { needsReview += 1; continue; }

    await pool.query(
      `INSERT INTO questions (
         concept_id, body, options, correct_letter, explanation, difficulty,
         source, generator_model, generator_prompt_hash,
         validation_status, validation_score, validation_metadata,
         approved_at, approved_by
       ) VALUES ($1,$2,$3,$4,$5,$6, 'ai_generated', $7, $8, 'approved', $9, $10, now(), 'pipeline')`,
      [
        concept.id, q.body, JSON.stringify(q.options), q.correct_letter,
        q.explanation, q.difficulty,
        gen.model, gen.promptHash,
        v.score, JSON.stringify({ passes: v.passes, reason: v.reason })
      ]
    );
    approved += 1;
  }

  console.log(
    `    → ${approved} approved, ${needsReview} needs_review, ${rejected} rejected ` +
    `($${(gen.costUSD).toFixed(4)} gen + validation)`
  );

  if (approved === 0) {
    throw new Error(
      `No questions for "${concept.code}" passed validation. Iterate prompts before retrying.`
    );
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Answer simulator — student more likely to get easier questions right and
// harder ones wrong; randomness draws from a sigmoid-ish curve.
// ──────────────────────────────────────────────────────────────────────────

function simulateAnswer(masteryScore, difficulty, correctLetter) {
  const target = masteryScore - (difficulty - 1) * 18;
  const pCorrect = Math.max(0.08, Math.min(0.92, (target + 30) / 100));
  if (Math.random() < pCorrect) return correctLetter;
  const wrongs = ['A', 'B', 'C', 'D'].filter(l => l !== correctLetter);
  return wrongs[Math.floor(Math.random() * wrongs.length)];
}

// ──────────────────────────────────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────────────────────────────────

async function printSummary(drillable) {
  const rows = await query(
    `SELECT c.code, c.name,
            COALESCE(m.score, 0) AS score,
            COALESCE(m.attempts_count, 0) AS attempts_count,
            COALESCE(m.correct_count, 0) AS correct_count
       FROM concepts c
  LEFT JOIN mastery m
         ON m.concept_id = c.id AND m.student_id = $1
      WHERE c.id = ANY($2::uuid[])
   ORDER BY c.sequence_order`,
    [DEMO.studentId, drillable.map(c => c.id)]
  );

  console.log('\n─── Final mastery ────────────────────────────────────');
  for (const r of rows) {
    const score = Number(r.score);
    const attempts = Number(r.attempts_count);
    const correct = Number(r.correct_count);
    const accuracy = attempts ? Math.round((correct / attempts) * 100) : 0;
    console.log(
      `  ${r.code.padEnd(28)} ${bar(score)} ${String(score).padStart(3)}/100  ` +
      `(${attempts} attempts, ${accuracy}% correct)`
    );
  }
}

function bar(score, width = 16) {
  const filled = Math.round((score / 100) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

function parseWk(wk) {
  if (typeof wk !== 'string') return { from: 1, to: 1 };
  const m = wk.match(/W(\d+)(?:\s*-\s*W?(\d+))?/i);
  if (!m) return { from: 1, to: 1 };
  const from = Number(m[1]);
  const to = m[2] ? Number(m[2]) : from;
  return { from, to };
}

function parseArgs(argv) {
  const out = {
    input: null,
    concepts: 3,
    questionsPerConcept: 4,
    rounds: 20,
    currentWeek: 5,
    reuseQuestions: false
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--reuse-questions') out.reuseQuestions = true;
    else if (a === '--concepts') out.concepts = Number(argv[++i]);
    else if (a === '--questions-per-concept') out.questionsPerConcept = Number(argv[++i]);
    else if (a === '--rounds') out.rounds = Number(argv[++i]);
    else if (a === '--current-week') out.currentWeek = Number(argv[++i]);
    else if (a.startsWith('--')) { console.error(`Unknown option: ${a}`); process.exit(1); }
    else if (!out.input) out.input = a;
    else { console.error(`Unexpected positional: ${a}`); process.exit(1); }
  }
  return out;
}
