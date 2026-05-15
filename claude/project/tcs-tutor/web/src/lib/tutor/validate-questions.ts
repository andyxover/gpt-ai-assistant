import { askJSON } from './anthropic';
import type { GeneratedQuestion, ConceptForGeneration } from './generate-questions';

export interface QuestionValidation {
  /** 0.000 - 1.000. Threshold for auto-approve is 0.7. */
  score: number;
  /** Pass-level: 'approved' (>= 0.7), 'needs_review' (< 0.7). */
  status: 'approved' | 'needs_review';
  /** Short human-readable explanation of the score. */
  notes: string;
  /** Specific issues that pulled the score down (empty if clean). */
  flags: string[];
}

export interface ValidationBatchResult {
  validations: QuestionValidation[];
  usage: { input_tokens: number; output_tokens: number };
  model: string;
}

const APPROVE_THRESHOLD = 0.7;

const VALIDATOR_SYSTEM = `You are a senior middle-school science teacher and assessment QA reviewer.
Another AI just generated multiple-choice questions. Your job is to grade
each one as if it were going on tomorrow's quiz.

For each question, evaluate FOUR dimensions:
  1. correctness     — is the "correct" answer actually correct?
                       Is it the ONLY correct answer? (no ambiguity)
  2. distractors     — are the wrong options plausible to a student who
                       half-understands the concept? (not silly throwaways)
  3. clarity         — is the wording clear, unambiguous, and at the
                       stated grade level? Free of trick phrasing?
  4. on_concept      — does the question test the actual stated concept,
                       not a tangent or a related-but-different concept?

Score 0.0-1.0 (rounded to 0.05). 1.0 = ship as-is. 0.7 = good enough,
minor nits acceptable. < 0.7 = needs teacher review before students see it.

Be strict. We'd rather flag a borderline question for human review than
ship something wrong.

Output strict JSON. No prose, no markdown.`;

function buildValidatorPrompt(
  questions: GeneratedQuestion[],
  concept: ConceptForGeneration,
): string {
  const items = questions
    .map((q, i) => {
      const opts = q.options
        .map(o => `      ${o.letter}. ${o.text}${o.correct ? '  ← marked correct' : ''}`)
        .join('\n');
      return `  Question ${i + 1}:
    Stem: ${q.body}
    Options:
${opts}
    Marked correct: ${q.correct_letter}
    Explanation given: ${q.explanation}
    Stated difficulty: ${q.difficulty}/5
    Bloom level: ${q.bloom_level}
    Misconception targeted: ${q.misconception_targeted}`;
    })
    .join('\n\n');

  return `Concept under test: ${concept.name}
${concept.chapter_title ? `Chapter: ${concept.chapter_title}\n` : ''}Grade level: ${concept.grade ?? 7}
${concept.description ? `Description: ${concept.description}\n` : ''}
Review the ${questions.length} question(s) below.

${items}

Return JSON of shape:
{
  "validations": [
    {
      "index": 0,
      "score": 0.85,
      "notes": "Solid question. Distractor C is a bit weak but on-concept.",
      "flags": ["distractor C is weak"]
    },
    ...
  ]
}

One entry per question, in the same order. "flags" is an array of short
strings naming specific issues (empty array if clean).`;
}

/**
 * Multi-pass validator: takes generator output + concept, runs a second
 * AI grading pass per batch, returns a validation verdict per question.
 *
 * Cost: one extra AI call per batch of questions for the same concept.
 * Typical batch is 5 questions → ~$0.01 in input + ~$0.01 in output
 * with Sonnet 4.6, so cheap relative to the cost of shipping a bad
 * question to a student.
 */
export async function validateGeneratedBatch(
  questions: GeneratedQuestion[],
  concept: ConceptForGeneration,
): Promise<ValidationBatchResult> {
  if (questions.length === 0) {
    return { validations: [], usage: { input_tokens: 0, output_tokens: 0 }, model: '' };
  }

  const result = await askJSON<{
    validations: { index: number; score: number; notes?: string; flags?: string[] }[];
  }>({
    system: VALIDATOR_SYSTEM,
    user: buildValidatorPrompt(questions, concept),
    maxTokens: 2048,
  });

  // Defensive: align validations to question order even if the model
  // shuffles them or skips one. Fallback to needs_review for any missing.
  const byIndex = new Map<number, { score: number; notes?: string; flags?: string[] }>();
  for (const v of result.data.validations ?? []) {
    if (typeof v.index === 'number') byIndex.set(v.index, v);
  }

  const validations: QuestionValidation[] = questions.map((_, i) => {
    const v = byIndex.get(i);
    if (!v) {
      return {
        score: 0,
        status: 'needs_review',
        notes: 'Validator did not return a verdict for this question.',
        flags: ['validator_missed'],
      };
    }
    const score = clamp01(typeof v.score === 'number' ? v.score : 0);
    return {
      score,
      status: score >= APPROVE_THRESHOLD ? 'approved' : 'needs_review',
      notes: typeof v.notes === 'string' ? v.notes : '',
      flags: Array.isArray(v.flags) ? v.flags.filter(f => typeof f === 'string') : [],
    };
  });

  return {
    validations,
    usage: result.usage,
    model: result.model,
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return Math.round(n * 100) / 100;
}
