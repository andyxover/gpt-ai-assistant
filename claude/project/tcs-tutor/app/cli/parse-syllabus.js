#!/usr/bin/env node
// Smoke test for the syllabus parser.
// Usage:  node cli/parse-syllabus.js <path-to-syllabus.txt>
//
// Reads a syllabus file, sends it through the parser, prints the
// structured JSON plus token usage and cost.

import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseSyllabus } from '../services/syllabus-parser.js';

const [,, inputPath] = process.argv;

if (!inputPath) {
  console.error('Usage: node cli/parse-syllabus.js <path-to-syllabus.txt>');
  console.error('Example: node cli/parse-syllabus.js samples/science-7-syllabus.txt');
  process.exit(1);
}

const fullPath = resolve(process.cwd(), inputPath);
const raw = readFileSync(fullPath, 'utf8');

console.log(`Parsing: ${fullPath}`);
console.log(`Source: ${raw.length} chars\n`);

const start = Date.now();

try {
  const { scope, usage, costUSD, model } = await parseSyllabus(raw);
  const elapsed = ((Date.now() - start) / 1000).toFixed(2);

  console.log('─── Parsed scope ──────────────────────────────────────');
  console.log(JSON.stringify(scope, null, 2));

  console.log('\n─── Summary ───────────────────────────────────────────');
  console.log(`Course:       ${scope.course?.name ?? '(none)'}`);
  console.log(`Chapters:     ${scope.chapters?.length ?? 0}`);
  const totalWeeks = (scope.chapters ?? []).reduce((s, c) => s + (c.weeks?.length ?? 0), 0);
  const totalConcepts = (scope.chapters ?? []).reduce(
    (s, c) => s + (c.weeks ?? []).reduce((ws, w) => ws + (w.concepts?.length ?? 0), 0), 0);
  console.log(`Weeks:        ${totalWeeks}`);
  console.log(`Concepts:     ${totalConcepts}`);
  console.log(`Safety-flagged: ${countSafetyCritical(scope)}`);
  console.log(`Assessments:  ${scope.assessments?.length ?? 0}`);
  if (scope._uncertainties?.length) {
    console.log(`\nUncertainties (${scope._uncertainties.length}):`);
    scope._uncertainties.forEach(u => console.log(`  - ${u}`));
  }

  console.log('\n─── Cost / latency ────────────────────────────────────');
  console.log(`Model:        ${model}`);
  console.log(`Input tokens: ${usage.input_tokens}`);
  console.log(`Output tokens: ${usage.output_tokens}`);
  console.log(`Cost:         $${costUSD.toFixed(4)} USD`);
  console.log(`Elapsed:      ${elapsed}s`);
} catch (err) {
  console.error('\nParse failed:');
  console.error(err.message);
  process.exit(2);
}

function countSafetyCritical(scope) {
  let count = 0;
  for (const ch of (scope.chapters ?? [])) {
    for (const w of (ch.weeks ?? [])) {
      for (const c of (w.concepts ?? [])) {
        if (c.is_safety_critical) count += 1;
      }
    }
  }
  return count;
}
