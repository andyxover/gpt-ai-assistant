import { askJSON } from '../lib/claude.js';

/**
 * Multi-pass quality validator for AI-generated questions.
 *
 * Implements DEPLOYMENT.md §3 Layer 2:
 *   - Pass A: self-critique (same model grades its own output)
 *   - Pass B: cross-model grade (different vendor/model, less correlated errors)
 *   - Pass C: fact-anchor (does it match the syllabus + standard curriculum?)
 *
 * Pass B is skipped if VALIDATOR_MODEL is not configured — in dev you can
 * run with just passes A and C, but production should ALWAYS have a
 * different-vendor model wired up.
 *
 * @param {object} question  Generated question (body, options, correct_letter, explanation, difficulty)
 * @param {object} concept   Concept context (name, description, chapter_title, grade)
 * @param {object} [opts]
 * @param {string} [opts.primaryModel]    Override for passes A and C
 * @param {string} [opts.crossModel]      Override for pass B (else uses env VALIDATOR_MODEL)
 * @returns {Promise<{
 *   decision: 'approve' | 'reject' | 'needs_review',
 *   score: number,                       // 0-1 aggregate
 *   passes: { name, decision, score, reasoning, model? }[],
 *   costUSD: number
 * }>}
 */
export async function validateQuestion(question, concept, opts = {}) {
  if (!question?.body) throw new Error('question.body is required');
  if (!concept?.name) throw new Error('concept.name is required');

  const passes = [];
  let totalCost = 0;

  const selfCritique = await runPass({
    name: 'self_critique',
    system: SELF_CRITIQUE_SYSTEM,
    user: buildCritiqueUser(question, concept),
    model: opts.primaryModel
  });
  passes.push(selfCritique.public);
  totalCost += selfCritique.costUSD;

  const crossModel = opts.crossModel || process.env.VALIDATOR_MODEL;
  if (crossModel) {
    const xModel = await runPass({
      name: 'cross_model',
      system: SELF_CRITIQUE_SYSTEM,
      user: buildCritiqueUser(question, concept),
      model: crossModel
    });
    passes.push(xModel.public);
    totalCost += xModel.costUSD;
  } else {
    passes.push({
      name: 'cross_model',
      decision: 'skip',
      score: null,
      reasoning: 'No VALIDATOR_MODEL configured. Production must enable cross-model validation.'
    });
  }

  const factAnchor = await runPass({
    name: 'fact_anchor',
    system: FACT_ANCHOR_SYSTEM,
    user: buildFactAnchorUser(question, concept),
    model: opts.primaryModel
  });
  passes.push(factAnchor.public);
  totalCost += factAnchor.costUSD;

  const aggregate = aggregateDecision(passes);

  return {
    decision: aggregate.decision,
    score: aggregate.score,
    reason: aggregate.reason,
    passes,
    costUSD: totalCost
  };
}

// ----------------------------------------------------------------------------
// Pass runner
// ----------------------------------------------------------------------------

async function runPass({ name, system, user, model }) {
  const result = await askJSON({ system, user, model, maxTokens: 1500 });
  const { decision, score, reasoning } = normalizeJudgment(result.data, name);
  return {
    public: { name, decision, score, reasoning, model: result.model },
    costUSD: result.costUSD
  };
}

function normalizeJudgment(data, passName) {
  const decision = data.decision;
  if (!['approve', 'reject', 'flag'].includes(decision)) {
    throw new Error(`Pass "${passName}" returned invalid decision: ${decision}`);
  }
  const score = Number(data.score);
  if (!Number.isFinite(score) || score < 0 || score > 1) {
    throw new Error(`Pass "${passName}" returned invalid score: ${data.score}`);
  }
  return { decision, score, reasoning: data.reasoning ?? data };
}

// ----------------------------------------------------------------------------
// Aggregation
// ----------------------------------------------------------------------------
// Approve   = all non-skipped passes vote approve, mean >= 0.85, min >= 0.70
// Reject    = any pass votes reject with score < 0.40
// Otherwise = needs_review (sent to teacher queue)

function aggregateDecision(passes) {
  const scored = passes.filter(p => p.decision !== 'skip');
  if (scored.length === 0) {
    return { decision: 'needs_review', score: 0, reason: 'No passes ran' };
  }

  const hardReject = scored.find(p => p.decision === 'reject' && p.score < 0.4);
  if (hardReject) {
    return {
      decision: 'reject',
      score: hardReject.score,
      reason: `${hardReject.name} rejected with low confidence (score=${hardReject.score.toFixed(2)})`
    };
  }

  const mean = scored.reduce((s, p) => s + p.score, 0) / scored.length;
  const min = Math.min(...scored.map(p => p.score));
  const allApprove = scored.every(p => p.decision === 'approve');

  if (allApprove && mean >= 0.85 && min >= 0.70) {
    return { decision: 'approve', score: mean, reason: `All passes approve (mean=${mean.toFixed(2)}, min=${min.toFixed(2)})` };
  }

  const flagged = scored.filter(p => p.decision !== 'approve').map(p => p.name);
  return {
    decision: 'needs_review',
    score: mean,
    reason: flagged.length
      ? `Mixed signals from ${flagged.join(', ')} (mean=${mean.toFixed(2)}, min=${min.toFixed(2)})`
      : `Score below approve threshold (mean=${mean.toFixed(2)}, min=${min.toFixed(2)})`
  };
}

// ----------------------------------------------------------------------------
// Prompts — self-critique / cross-model (same prompt, different model)
// ----------------------------------------------------------------------------

const SELF_CRITIQUE_SYSTEM = `You grade multiple-choice science questions written for middle-school students.

You are STRICT but FAIR. Approve only what you'd be comfortable putting in
front of real students. Real students at this grade level (11-14) include
strong and weak readers; the question must work for both.

Output strict JSON matching the schema in the user prompt. No prose,
no markdown.`;

function buildCritiqueUser(question, concept) {
  return `Grade this question on five dimensions, each 0-1:

1. factual_accuracy — Are all facts in question, options, and explanation correct for the grade-level curriculum?
2. single_correct_answer — Is there exactly one defensible right answer, and are the others clearly wrong on close reading?
3. distractor_quality — Do the wrong answers reflect actual student misconceptions (not throwaway nonsense)?
4. age_appropriateness — Is vocabulary, sentence structure, and complexity appropriate for Grade ${concept.grade ?? 7}?
5. explanation_quality — Does the explanation TEACH (not just restate the answer)?

Then output an overall decision and aggregate score.

JSON schema:
{
  "scores": {
    "factual_accuracy": number,
    "single_correct_answer": number,
    "distractor_quality": number,
    "age_appropriateness": number,
    "explanation_quality": number
  },
  "score": number,                            // overall, 0-1
  "decision": "approve" | "flag" | "reject",  // approve >=0.85; reject if any critical issue; flag otherwise
  "reasoning": {
    "strengths": [string],
    "concerns": [string],
    "must_fix": [string]                      // empty if approve
  }
}

Decision rules:
- "reject" if factual_accuracy < 0.7 OR single_correct_answer < 0.7 (these are non-negotiable)
- "approve" if overall score >= 0.85 and no individual dimension < 0.7
- "flag" otherwise

Question to grade:
---
Concept: ${concept.name}
Chapter: ${concept.chapter_title ?? '(unspecified)'}
Grade:   ${concept.grade ?? 7}

Body: ${question.body}

Options:
${question.options.map(o => `  ${o.letter}) ${o.text}${o.correct ? '  [correct]' : ''}`).join('\n')}

Stated correct answer: ${question.correct_letter}
Difficulty: ${question.difficulty}

Explanation:
${question.explanation}
---`;
}

// ----------------------------------------------------------------------------
// Prompts — fact-anchor
// ----------------------------------------------------------------------------

const FACT_ANCHOR_SYSTEM = `You verify that science questions are factually correct and on-scope for a specific syllabus.

You are not the question's author. Treat every factual claim as a hypothesis
to check against what a competent science teacher would say at this grade
level. Flag anything that's wrong, oversimplified to the point of being
misleading, or out-of-scope for the syllabus concept named.

Output strict JSON. No prose, no markdown.`;

function buildFactAnchorUser(question, concept) {
  return `Verify this question against the named concept.

Concept name:     ${concept.name}
Chapter:          ${concept.chapter_title ?? '(unspecified)'}
Grade:            ${concept.grade ?? 7}
Concept description (from syllabus):
${concept.description ?? '(none provided — judge by name + chapter)'}

Question:
${question.body}

Options:
${question.options.map(o => `  ${o.letter}) ${o.text}`).join('\n')}

Stated correct answer: ${question.correct_letter}

Explanation:
${question.explanation}

Check:
1. on_scope — Is this question genuinely about the named concept, or has it drifted to a different topic?
2. facts_correct — Is every factual claim (in question, options, explanation) accurate?
3. answer_correct — Is the stated correct answer actually correct?
4. age_appropriate — Is the difficulty and vocabulary right for Grade ${concept.grade ?? 7}?

JSON schema:
{
  "checks": {
    "on_scope":        { "pass": boolean, "score": number, "notes": string },
    "facts_correct":   { "pass": boolean, "score": number, "notes": string },
    "answer_correct":  { "pass": boolean, "score": number, "notes": string },
    "age_appropriate": { "pass": boolean, "score": number, "notes": string }
  },
  "score": number,                            // 0-1 overall
  "decision": "approve" | "flag" | "reject",
  "reasoning": string                         // 1-3 sentences explaining the decision
}

Decision rules:
- "reject" if facts_correct.pass=false OR answer_correct.pass=false (factual errors are disqualifying)
- "approve" if all four checks pass and overall score >= 0.85
- "flag" otherwise`;
}
