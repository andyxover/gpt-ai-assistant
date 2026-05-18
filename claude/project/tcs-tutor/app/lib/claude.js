import Anthropic from '@anthropic-ai/sdk';

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  throw new Error('ANTHROPIC_API_KEY is not set. Copy .env.example to .env and fill it in.');
}

export const claude = new Anthropic({ apiKey });

export const DEFAULT_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';

// Sonnet 4.6 pricing as of 2026-05 (USD per million tokens).
// Update when pricing changes.
const PRICING = {
  'claude-sonnet-4-6': { input: 3.00, output: 15.00 },
  'claude-opus-4-7':   { input: 15.00, output: 75.00 },
  'claude-haiku-4-5':  { input: 0.80, output: 4.00 }
};

export function estimateCostUSD(model, usage) {
  const p = PRICING[model] || PRICING['claude-sonnet-4-6'];
  return (usage.input_tokens * p.input + usage.output_tokens * p.output) / 1_000_000;
}

/**
 * Ask Claude for strict JSON output.
 * Extracts the first `{...}` block from the response and JSON-parses it.
 * Validates JSON; throws if unparseable.
 *
 * @param {object} opts
 * @param {string} opts.system - System prompt
 * @param {string} opts.user - User prompt
 * @param {string} [opts.model] - Model override
 * @param {number} [opts.maxTokens=4096]
 * @returns {Promise<{ data: object, usage: object, costUSD: number, model: string }>}
 */
export async function askJSON({ system, user, model, maxTokens = 4096 }) {
  const useModel = model || DEFAULT_MODEL;
  const response = await claude.messages.create({
    model: useModel,
    max_tokens: maxTokens,
    system,
    messages: [
      { role: 'user', content: user }
    ]
  });

  const raw = response.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');

  const text = extractJSONObject(raw);

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Claude returned unparseable JSON. First 200 chars: ${raw.slice(0, 200)}`);
  }

  return {
    data,
    usage: response.usage,
    costUSD: estimateCostUSD(useModel, response.usage),
    model: useModel
  };
}

// Pull the first balanced {...} block out of a response.
// Tolerates leading prose, markdown fences, and trailing commentary.
function extractJSONObject(raw) {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end < 0 || end <= start) {
    throw new Error(`Claude returned no JSON object. First 200 chars: ${raw.slice(0, 200)}`);
  }
  return raw.slice(start, end + 1);
}
