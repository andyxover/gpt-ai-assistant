import { askJSON } from './anthropic';

export interface ParsedConcept {
  code: string;
  name: string;
  is_safety_critical: boolean;
}

export interface ParsedWeek {
  wk: string;
  topics: string[];
  concepts: ParsedConcept[];
}

export interface ParsedChapter {
  title: string;
  sequence: number;
  weeks: ParsedWeek[];
}

export interface ParsedScope {
  course: { name: string; subject: string; grade: number | null; semester: string | null; textbook: string | null };
  teacher: { name: string | null; title: string | null };
  sections: string[];
  chapters: ParsedChapter[];
  assessments: { name: string; weight_percent: number | null; weeks: string[]; scope: string | null }[];
  notes: string | null;
  _uncertainties: string[];
}

export interface ParseSyllabusResult {
  scope: ParsedScope;
  usage: { input_tokens: number; output_tokens: number };
  model: string;
}

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
    "name": string,
    "subject": string,
    "grade": number|null,
    "semester": string|null,
    "textbook": string|null
  },
  "teacher": { "name": string|null, "title": string|null },
  "sections": [string],
  "chapters": [{
    "title": string,
    "sequence": number,
    "weeks": [{
      "wk": string,
      "topics": [string],
      "concepts": [{ "code": string, "name": string, "is_safety_critical": boolean }]
    }]
  }],
  "assessments": [{ "name": string, "weight_percent": number|null, "weeks": [string], "scope": string|null }],
  "notes": string|null,
  "_uncertainties": [string]
}

Rules:
1. Concepts must be ATOMIC — one self-contained idea per concept.
2. Concept codes are short snake_case identifiers (under 25 chars).
3. Concept names are reader-friendly (under 40 chars).
4. Flag is_safety_critical TRUE for: lab safety, handling chemicals,
   heat sources, electricity, sharp tools, lab equipment safety.
5. List anything inferred or uncertain in _uncertainties.

Syllabus to parse:
---
{{SYLLABUS}}
---`;

export async function parseSyllabus(rawText: string): Promise<ParseSyllabusResult> {
  if (!rawText || rawText.trim().length < 50) {
    throw new Error('Syllabus text is empty or too short (minimum 50 chars).');
  }
  // A full-year syllabus (36 weeks × ~5-8 atomic concepts each + assessments
  // section) can run 8-12K output tokens of JSON. 4096 was truncating
  // mid-string on Grade 7 English Social Studies. 16K leaves headroom for
  // longer overviews without inflating cost on short ones (Anthropic only
  // charges for actual output tokens emitted, not the cap).
  const result = await askJSON<ParsedScope>({
    system: SYSTEM_PROMPT,
    user: USER_PROMPT_TEMPLATE.replace('{{SYLLABUS}}', rawText.trim()),
    maxTokens: 16384,
  });
  return { scope: result.data, usage: result.usage, model: result.model };
}
