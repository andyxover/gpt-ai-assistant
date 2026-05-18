import { askJSON } from '../lib/claude.js';

/**
 * Parse a raw teacher syllabus into a structured scope.
 *
 * The parser is conservative: it returns `null` for fields it can't find
 * and lists what it was uncertain about in `_uncertainties`. The teacher
 * confirms or edits the output before it goes live — this is the single
 * point of human review in the content pipeline (see DEPLOYMENT.md §3).
 *
 * @param {string} rawText - The teacher's syllabus, plain text.
 * @param {object} [opts]
 * @param {string} [opts.model] - Model override.
 * @returns {Promise<{ scope: object, usage: object, costUSD: number, model: string }>}
 */
export async function parseSyllabus(rawText, opts = {}) {
  if (!rawText || typeof rawText !== 'string' || rawText.trim().length < 50) {
    throw new Error('Syllabus text is empty or too short (minimum 50 chars).');
  }

  const system = SYSTEM_PROMPT;
  const user = USER_PROMPT_TEMPLATE.replace('{{SYLLABUS}}', rawText.trim());

  const result = await askJSON({ system, user, model: opts.model, maxTokens: 4096 });
  validateScope(result.data);
  return { scope: result.data, usage: result.usage, costUSD: result.costUSD, model: result.model };
}

// ----------------------------------------------------------------------------
// Validation — make sure the AI output matches our schema before we use it
// ----------------------------------------------------------------------------

function validateScope(scope) {
  const errors = [];
  if (!scope || typeof scope !== 'object') errors.push('scope is not an object');
  if (!scope.course || typeof scope.course.name !== 'string') errors.push('course.name missing');
  if (!Array.isArray(scope.chapters)) errors.push('chapters is not an array');

  if (Array.isArray(scope.chapters)) {
    scope.chapters.forEach((ch, i) => {
      if (typeof ch.title !== 'string') errors.push(`chapters[${i}].title missing`);
      if (!Array.isArray(ch.weeks)) errors.push(`chapters[${i}].weeks not an array`);
      if (Array.isArray(ch.weeks)) {
        ch.weeks.forEach((w, j) => {
          if (typeof w.wk !== 'string') errors.push(`chapters[${i}].weeks[${j}].wk missing`);
          if (!Array.isArray(w.concepts)) errors.push(`chapters[${i}].weeks[${j}].concepts missing`);
        });
      }
    });
  }

  if (errors.length) {
    throw new Error(`Parsed scope failed validation:\n  - ${errors.join('\n  - ')}`);
  }
}

// ----------------------------------------------------------------------------
// Prompts
// ----------------------------------------------------------------------------

const SYSTEM_PROMPT = `You parse teacher syllabi into structured learning paths for an AI tutoring system.

Your output drives three downstream systems:
1. A week-by-week progress tracker shown to teachers and students
2. A question generator that creates practice problems per concept
3. A predictive engine that estimates exam readiness

Because downstream systems trust your structure, be precise and conservative.
NEVER invent content not present in the syllabus. If a field isn't in the
input, use null. List anything you were unsure about in _uncertainties.

You ALWAYS return strict JSON matching the schema given in the user prompt.
No markdown, no prose, no code fences — just the JSON object.`;

const USER_PROMPT_TEMPLATE = `Parse the following teacher syllabus into JSON.

JSON schema:
{
  "course": {
    "name": string,                  // e.g. "Grade 7 Science"
    "subject": string,               // e.g. "science", "math", "english"
    "grade": number|null,            // e.g. 7
    "semester": string|null,         // e.g. "Semester 1"
    "textbook": string|null
  },
  "teacher": {
    "name": string|null,
    "title": string|null             // e.g. "Ms.", "Mr.", "Dr."
  },
  "sections": [string],              // class sections covered, e.g. ["7A","7B"]
  "chapters": [{
    "title": string,                 // e.g. "Ch.2 Living Things"
    "sequence": number,              // 1-indexed
    "weeks": [{
      "wk": string,                  // e.g. "W3" or "W3-W4"
      "topics": [string],            // human-readable topic phrases
      "concepts": [{                 // atomic learning units for the tracker
        "code": string,              // snake_case ID, e.g. "cell_membrane"
        "name": string,              // display name, e.g. "Cell Membrane"
        "is_safety_critical": boolean  // true ONLY for lab safety / chemicals / equipment safety
      }]
    }]
  }],
  "assessments": [{
    "name": string,                  // e.g. "First Mid-Term"
    "weight_percent": number|null,
    "weeks": [string],               // e.g. ["W9"]
    "scope": string|null             // e.g. "Ch.1-Ch.2"
  }],
  "notes": string|null,              // teacher's emphasis or special instructions
  "_uncertainties": [string]         // describe anything you weren't sure about
}

Rules:
1. Concepts must be ATOMIC — one self-contained idea per concept. Split
   compound topics. E.g. "Cell structure and function" → ["cell_membrane",
   "cell_nucleus", "cell_wall", "chloroplasts_and_mitochondria",
   "animal_vs_plant_cells"].
2. Concept codes are short snake_case identifiers (under 25 chars).
3. Concept names are reader-friendly (under 40 chars).
4. Flag is_safety_critical TRUE for: lab safety, handling chemicals,
   heat sources, electricity, sharp tools, lab equipment safety. Otherwise FALSE.
5. If a week covers multiple topics, list them all under "topics".
6. If you're inferring (e.g. guessing chapter structure from week list),
   note it in _uncertainties.
7. Sequences and week numbers must be plausible and ordered.

Syllabus to parse:
---
{{SYLLABUS}}
---`;
