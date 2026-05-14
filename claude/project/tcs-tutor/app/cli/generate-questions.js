#!/usr/bin/env node
// End-to-end content pipeline smoke test:
//   parse syllabus → pick concept → generate questions → validate each
//
// Usage:
//   node cli/generate-questions.js <syllabus-file> [options]
//
// Options:
//   --concept <code>       Concept code to target (default: first non-safety-critical)
//   --count <n>            Number of questions to generate (default: 5)
//   --diff-min <n>         Minimum difficulty 1-5 (default: 1)
//   --diff-max <n>         Maximum difficulty 1-5 (default: 4)
//   --list                 List concepts from the syllabus and exit
//   --skip-validation      Skip the validator (just show generated output)
//   --verbose              Print full question bodies + per-pass reasoning
//
// Example:
//   node cli/generate-questions.js samples/science-7-syllabus.txt \
//     --concept cell_membrane --count 5 --verbose

import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseSyllabus } from '../services/syllabus-parser.js';
import { generateQuestions } from '../services/question-generator.js';
import { validateQuestion } from '../services/question-validator.js';

const args = parseArgs(process.argv.slice(2));

if (!args.input) {
  console.error('Usage: node cli/generate-questions.js <syllabus-file> [options]');
  console.error('       node cli/generate-questions.js <syllabus-file> --list');
  process.exit(1);
}

const fullPath = resolve(process.cwd(), args.input);
const raw = readFileSync(fullPath, 'utf8');
const overallStart = Date.now();

// ──────────────────────────────────────────────────────────────
// 1. Parse syllabus
// ──────────────────────────────────────────────────────────────

console.log(`▸ Parsing syllabus (${args.input})...`);
const { scope, costUSD: parseCost, model: parseModel } = await parseSyllabus(raw);
const concepts = flattenConcepts(scope);
console.log(`  ${concepts.length} concepts extracted via ${parseModel}, cost $${parseCost.toFixed(4)}\n`);

if (args.list) {
  console.log('Available concepts:');
  for (const c of concepts) {
    const flag = c.is_safety_critical ? ' [safety-critical, AI generation blocked]' : '';
    console.log(`  ${c.code.padEnd(28)} ${c.name}${flag}`);
    console.log(`    ${c.chapter_title} · ${c.week}`);
  }
  process.exit(0);
}

// ──────────────────────────────────────────────────────────────
// 2. Pick target concept
// ──────────────────────────────────────────────────────────────

let target;
if (args.concept) {
  target = concepts.find(c => c.code === args.concept);
  if (!target) {
    console.error(`No concept with code "${args.concept}". Run with --list to see available concepts.`);
    process.exit(2);
  }
} else {
  target = concepts.find(c => !c.is_safety_critical);
  if (!target) {
    console.error('No non-safety-critical concepts found in this syllabus.');
    process.exit(2);
  }
}

console.log(`▸ Target concept: ${target.code}`);
console.log(`  Name:    ${target.name}`);
console.log(`  Chapter: ${target.chapter_title}`);
console.log(`  Week:    ${target.week}`);
console.log(`  Grade:   ${target.grade}`);
if (target.description) console.log(`  Topics:  ${target.description}`);
console.log();

// ──────────────────────────────────────────────────────────────
// 3. Generate
// ──────────────────────────────────────────────────────────────

console.log(`▸ Generating ${args.count} questions (difficulty ${args.diffMin}-${args.diffMax})...`);
const genStart = Date.now();

let gen;
try {
  gen = await generateQuestions(target, {
    count: args.count,
    difficulty_range: [args.diffMin, args.diffMax]
  });
} catch (err) {
  console.error(`\nGeneration failed: ${err.message}`);
  process.exit(3);
}

const genElapsed = ((Date.now() - genStart) / 1000).toFixed(1);
console.log(`  ${gen.questions.length} generated in ${genElapsed}s via ${gen.model}`);
console.log(`  Prompt hash: ${gen.promptHash}`);
console.log(`  Cost: $${gen.costUSD.toFixed(4)}\n`);

// ──────────────────────────────────────────────────────────────
// 4. Validate each
// ──────────────────────────────────────────────────────────────

let validations = [];
let valCost = 0;
let crossModelSkipped = false;

if (!args.skipValidation) {
  console.log(`▸ Validating ${gen.questions.length} questions through multi-pass pipeline...`);
  for (const [i, q] of gen.questions.entries()) {
    const v = await validateQuestion(q, target);
    validations.push(v);
    valCost += v.costUSD;
    if (v.passes.some(p => p.name === 'cross_model' && p.decision === 'skip')) {
      crossModelSkipped = true;
    }
    const tag = decisionTag(v.decision);
    console.log(`  Q${i + 1}  ${tag}  score=${v.score.toFixed(2)}  — ${v.reason}`);
  }
  console.log(`  Validation cost: $${valCost.toFixed(4)}\n`);
} else {
  console.log('▸ Skipping validation (--skip-validation)\n');
}

// ──────────────────────────────────────────────────────────────
// 5. Summary
// ──────────────────────────────────────────────────────────────

const approveCount = validations.filter(v => v.decision === 'approve').length;
const reviewCount = validations.filter(v => v.decision === 'needs_review').length;
const rejectCount = validations.filter(v => v.decision === 'reject').length;
const totalCost = parseCost + gen.costUSD + valCost;
const totalElapsed = ((Date.now() - overallStart) / 1000).toFixed(1);

console.log('─── Summary ──────────────────────────────────────────');
console.log(`Concept:           ${target.name}`);
console.log(`Generated:         ${gen.questions.length}`);
if (!args.skipValidation) {
  const passRate = ((approveCount / gen.questions.length) * 100).toFixed(0);
  console.log(`Approved:          ${approveCount}/${gen.questions.length}  (${passRate}%)`);
  console.log(`Needs review:      ${reviewCount}/${gen.questions.length}`);
  console.log(`Rejected:          ${rejectCount}/${gen.questions.length}`);
}
console.log(`Total cost:        $${totalCost.toFixed(4)}` +
  `  (parse $${parseCost.toFixed(4)} + gen $${gen.costUSD.toFixed(4)}` +
  (args.skipValidation ? '' : ` + val $${valCost.toFixed(4)}`) + `)`);
console.log(`Total elapsed:     ${totalElapsed}s`);

if (crossModelSkipped) {
  console.log(`\nNote: cross-model validation was skipped because VALIDATOR_MODEL`);
  console.log(`is not set. Production should configure a different-vendor model`);
  console.log(`(e.g. gpt-4o-mini, gemini-flash) for less-correlated checking.`);
}

if (!args.skipValidation && approveCount / gen.questions.length < 0.95) {
  console.log(`\nDEPLOYMENT.md §3 sets a 95% approval bar before pilot launch.`);
  console.log(`This batch is below the bar — iterate generation prompts.`);
}

// ──────────────────────────────────────────────────────────────
// 6. Verbose dump
// ──────────────────────────────────────────────────────────────

if (args.verbose) {
  console.log('\n─── Generated questions (verbose) ─────────────────────');
  gen.questions.forEach((q, i) => {
    const v = validations[i];
    const tag = v ? `  [${v.decision.toUpperCase()}]` : '';
    console.log(`\nQ${i + 1}${tag}  difficulty ${q.difficulty} · ${q.bloom_level} · targets: ${q.misconception_targeted ?? '(unspecified)'}`);
    console.log(q.body);
    for (const o of q.options) {
      const mark = o.correct ? '✓' : ' ';
      console.log(`  ${mark} ${o.letter}) ${o.text}`);
      console.log(`       → ${o.why}`);
    }
    console.log(`  Explanation: ${q.explanation}`);
    if (v) {
      console.log(`  Validator reason: ${v.reason}`);
      for (const p of v.passes) {
        const score = p.score === null ? '—' : p.score.toFixed(2);
        console.log(`    · ${p.name.padEnd(14)} ${p.decision.padEnd(8)} score=${score}`);
      }
    }
  });
}

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

function flattenConcepts(scope) {
  const grade = scope.course?.grade ?? 7;
  const out = [];
  for (const chapter of (scope.chapters ?? [])) {
    for (const week of (chapter.weeks ?? [])) {
      for (const c of (week.concepts ?? [])) {
        out.push({
          code: c.code,
          name: c.name,
          is_safety_critical: c.is_safety_critical ?? false,
          chapter_title: chapter.title,
          grade,
          week: week.wk,
          description: week.topics?.length ? week.topics.join('; ') : null
        });
      }
    }
  }
  return out;
}

function decisionTag(decision) {
  if (decision === 'approve') return 'APPROVE     ';
  if (decision === 'reject') return 'REJECT      ';
  return 'NEEDS_REVIEW';
}

function parseArgs(argv) {
  const out = {
    input: null,
    concept: null,
    count: 5,
    diffMin: 1,
    diffMax: 4,
    list: false,
    skipValidation: false,
    verbose: false
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--list') out.list = true;
    else if (a === '--skip-validation') out.skipValidation = true;
    else if (a === '--verbose' || a === '-v') out.verbose = true;
    else if (a === '--concept') out.concept = argv[++i];
    else if (a === '--count') out.count = Number(argv[++i]);
    else if (a === '--diff-min') out.diffMin = Number(argv[++i]);
    else if (a === '--diff-max') out.diffMax = Number(argv[++i]);
    else if (a.startsWith('--')) {
      console.error(`Unknown option: ${a}`);
      process.exit(1);
    }
    else if (!out.input) out.input = a;
    else {
      console.error(`Unexpected positional argument: ${a}`);
      process.exit(1);
    }
  }
  return out;
}
