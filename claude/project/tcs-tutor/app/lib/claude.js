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
 * Uses assistant-prefill with `{` to force JSON-shaped output and avoid
 * markdown code fences. Validates JSON; throws if unparseable.
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
      { role: 'user', content: user },
      { role: 'assistant', content: '{' }  // prefill: force JSON object
    ]
  });

  const text = '{' + response.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');

  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    // One repair attempt — trim to the last `}` in case the model added trailing prose.
    const lastBrace = text.lastIndexOf('}');
    if (lastBrace > 0) {
      try { data = JSON.parse(text.slice(0, lastBrace + 1)); }
      catch { throw new Error(`Claude returned unparseable JSON. First 200 chars: ${text.slice(0, 200)}`); }
    } else {
      throw new Error(`Claude returned no JSON object. First 200 chars: ${text.slice(0, 200)}`);
    }
  }

  return {
    data,
    usage: response.usage,
    costUSD: estimateCostUSD(useModel, response.usage),
    model: useModel
  };
}
