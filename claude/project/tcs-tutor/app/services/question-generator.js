import { createHash } from 'node:crypto';
import { askJSON } from '../lib/claude.js';

/**
 * Generate N multiple-choice questions for one concept.
 *
 * Output is unvalidated raw generation — feed each through
 * `validateQuestion` (services/question-validator.js) before storing
 * with status='approved'.
 *
 * Hard rule: refuses to generate for safety-critical concepts. Those
 * must be teacher-authored. See DEPLOYMENT.md §3.
 *
 * @param {object} concept     Concept row (id, name, description, chapter_title, grade, is_safety_critical)
 * @param {object} [params]
 * @param {number} [params.count=5]
 * @param {[number,number]} [params.difficulty_range=[1,4]]  1=recall, 5=synthesis
 * @param {string[]} [params.avoid_similar_to=[]]  Existing question stems to differentiate from
 * @param {object} [opts]
 * @param {string} [opts.model]
 * @returns {Promise<{ questions: object[], usage, costUSD, model, promptHash }>}
 */
export async function generateQuestions(concept, params = {}, opts = {}) {
  if (!concept?.name) throw new Error('concept.name is required');
  if (concept.is_safety_critical) {
    throw new Error(
      `Refusing to AI-generate questions for safety-critical concept "${concept.name}". ` +
      `These must be teacher-authored (DEPLOYMENT.md §3, hard rule).`
    );
  }

  const count = params.count ?? 5;
  const [diffMin, diffMax] = params.difficulty_range ?? [1, 4];
  const priorStems = params.avoid_similar_to ?? [];

  if (count < 1 || count > 20) throw new Error('count must be between 1 and 20');
  if (diffMin < 1 || diffMax > 5 || diffMin > diffMax) {
    throw new Error('difficulty_range must satisfy 1 <= min <= max <= 5');
  }

  const user = USER_PROMPT_TEMPLATE
    .replaceAll('{{COUNT}}', String(count))
    .replaceAll('{{CONCEPT_NAME}}', concept.name)
    .replaceAll('{{CONCEPT_DESCRIPTION}}', concept.description ?? '(no description provided)')
    .replaceAll('{{CHAPTER}}', concept.chapter_title ?? '(unspecified)')
    .replaceAll('{{GRADE}}', String(concept.grade ?? 7))
    .replaceAll('{{DIFF_MIN}}', String(diffMin))
    .replaceAll('{{DIFF_MAX}}', String(diffMax))
    .replaceAll('{{AVOID}}',
      priorStems.length
        ? priorStems.map(s => `  - ${s}`).join('\n')
        : '  (none)');

  const result = await askJSON({
    system: SYSTEM_PROMPT,
    user,
    model: opts.model,
    maxTokens: 4096
  });

  const questions = validateBatchSchema(result.data, count, concept);

  for (const q of questions) {
    q.source = 'ai_generated';
    q.generator_model = result.model;
    q.generator_prompt_hash = PROMPT_HASH;
  }

  return {
    questions,
    usage: result.usage,
    costUSD: result.costUSD,
    model: result.model,
    promptHash: PROMPT_HASH
  };
}

// ----------------------------------------------------------------------------
// Schema validation on the generator's output. Reject upstream if malformed —
// the validator pipeline shouldn't have to handle invalid shapes.
// ----------------------------------------------------------------------------

function validateBatchSchema(data, expectedCount, concept) {
  const errors = [];
  if (!data || !Array.isArray(data.questions)) {
    throw new Error('Generator returned no `questions` array.');
  }
  const list = data.questions;
  if (list.length !== expectedCount) {
    errors.push(`Expected ${expectedCount} questions, got ${list.length}`);
  }

  list.forEach((q, i) => {
    const prefix = `questions[${i}]`;
    if (typeof q.body !== 'string' || q.body.length < 10) errors.push(`${prefix}.body missing or too short`);
    if (!Array.isArray(q.options) || q.options.length !== 4) {
      errors.push(`${prefix}.options must be array of length 4`);
      return;
    }
    const letters = q.options.map(o => o.letter);
    if (JSON.stringify(letters) !== '["A","B","C","D"]') {
      errors.push(`${prefix}.options must have letters A,B,C,D in order (got ${JSON.stringify(letters)})`);
    }
    const correctOptions = q.options.filter(o => o.correct === true);
    if (correctOptions.length !== 1) {
      errors.push(`${prefix} must have exactly one correct option (got ${correctOptions.length})`);
    }
    if (!['A', 'B', 'C', 'D'].includes(q.correct_letter)) {
      errors.push(`${prefix}.correct_letter must be A-D`);
    }
    if (correctOptions[0] && correctOptions[0].letter !== q.correct_letter) {
      errors.push(`${prefix}.correct_letter (${q.correct_letter}) doesn't match the option flagged correct (${correctOptions[0].letter})`);
    }
    if (typeof q.explanation !== 'string' || q.explanation.length < 20) {
      errors.push(`${prefix}.explanation missing or too short`);
    }
    if (typeof q.difficulty !== 'number' || q.difficulty < 1 || q.difficulty > 5) {
      errors.push(`${prefix}.difficulty must be 1-5`);
    }
  });

  if (errors.length) {
    throw new Error(`Generator output failed schema validation for concept "${concept.name}":\n  - ${errors.join('\n  - ')}`);
  }
  return list;
}

// ----------------------------------------------------------------------------
// Prompts
// ----------------------------------------------------------------------------

const SYSTEM_PROMPT = `You write multiple-choice science questions for middle-school students (ages 11-14).

Your questions are deployed to real students through an AI tutor. They are
validated by a separate model after you generate them, and a teacher
spot-checks 10% of all questions. Aim for the bar your work would clear
under that scrutiny.

Pedagogical principles you follow:
- Distractors target SPECIFIC student misconceptions, not random wrong
  answers. A good distractor is what a student who half-understands the
  concept would pick.
- Vocabulary matches the grade level. No technical jargon a student
  wouldn't have seen in their textbook.
- Each question tests ONE idea. Compound questions are split.
- Explanations TEACH the concept — they don't just state the answer.
  A student who got it wrong should learn something from reading them.
- Difficulty 1 = direct recall. 2 = basic understanding (compare/contrast).
  3 = application (use the concept in a new context). 4 = analysis (break
  down a scenario). 5 = synthesis (combine concepts). Most middle school
  practice should be 1-3.

What you NEVER do:
- "All of the above" or "None of the above" options
- Trick questions or deliberately ambiguous wording
- Questions that rely on memorizing specific page numbers or trivia
- Cultural references that might not translate (this is a Taiwan school)
- Invent facts. If you're unsure of a detail, choose a different angle.

Output is always strict JSON matching the schema in the user prompt.
No prose, no markdown, no code fences.`;

const USER_PROMPT_TEMPLATE = `Generate {{COUNT}} multiple-choice questions for one concept.

Concept:      {{CONCEPT_NAME}}
Chapter:      {{CHAPTER}}
Grade level:  {{GRADE}}
Description:  {{CONCEPT_DESCRIPTION}}

Difficulty range: {{DIFF_MIN}}-{{DIFF_MAX}} (spread the questions across the range; don't bunch them at one end).

Existing question stems on this concept — your new questions must approach the concept from a DIFFERENT angle than each of these:
{{AVOID}}

JSON schema:
{
  "questions": [
    {
      "body": string,             // the question stem
      "options": [
        { "letter": "A", "text": string, "correct": boolean, "why": string },
        { "letter": "B", "text": string, "correct": boolean, "why": string },
        { "letter": "C", "text": string, "correct": boolean, "why": string },
        { "letter": "D", "text": string, "correct": boolean, "why": string }
      ],
      "correct_letter": "A" | "B" | "C" | "D",
      "explanation": string,      // teaches the concept — 1 to 3 sentences
      "difficulty": number,       // 1 to 5
      "bloom_level": "remember" | "understand" | "apply" | "analyze" | "evaluate",
      "misconception_targeted": string  // which student misconception this question surfaces
    }
  ]
}

Rules:
1. Exactly 4 options, letters A-D in order, exactly ONE correct.
2. correct_letter must match the option whose "correct" field is true.
3. The "why" field on each option explains why that option is right OR what misconception leads a student to it (1 short sentence).
4. The "explanation" field is for the student who got the question wrong — it should help them understand, not just state the answer.
5. No "All of the above" or "None of the above" options.
6. Each question must be fully self-contained (no "see previous question").
7. Do not invent facts. If unsure, pick a different angle on the concept.`;

const PROMPT_HASH = createHash('sha256')
  .update(SYSTEM_PROMPT + '\n--SEP--\n' + USER_PROMPT_TEMPLATE)
  .digest('hex')
  .slice(0, 16);
