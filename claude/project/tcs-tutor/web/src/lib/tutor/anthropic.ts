import Anthropic from '@anthropic-ai/sdk';

let _client: Anthropic | null = null;

export function getClaude(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

export const DEFAULT_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';

export interface AskJSONResult<T = unknown> {
  data: T;
  usage: { input_tokens: number; output_tokens: number };
  model: string;
}

/**
 * Same pattern as tcs-tutor/app/lib/claude.js — strict JSON output via
 * first/last-brace extraction. No assistant prefill (Sonnet 4.6 rejects it).
 */
export async function askJSON<T = unknown>(opts: {
  system: string;
  user: string;
  model?: string;
  maxTokens?: number;
}): Promise<AskJSONResult<T>> {
  const model = opts.model || DEFAULT_MODEL;
  const claude = getClaude();
  const response = await claude.messages.create({
    model,
    max_tokens: opts.maxTokens ?? 4096,
    system: opts.system,
    messages: [{ role: 'user', content: opts.user }],
  });

  const raw = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('');

  // Detect truncation BEFORE trying to parse — Claude hit max_tokens and
  // the JSON is cut mid-string. The vague "unparseable JSON" error this
  // used to produce sent us hunting for the wrong root cause on long
  // syllabi. Surface it explicitly with a hint to raise maxTokens.
  if (response.stop_reason === 'max_tokens') {
    throw new Error(
      `Claude response was truncated at max_tokens (${opts.maxTokens ?? 4096}). ` +
      `Output had ${response.usage.output_tokens} tokens. ` +
      `Raise maxTokens on this call site, or shorten the input.`,
    );
  }

  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new Error(`Claude returned no JSON. First 200: ${raw.slice(0, 200)}`);
  }
  const text = raw.slice(start, end + 1);

  let data: T;
  try { data = JSON.parse(text) as T; }
  catch { throw new Error(`Claude returned unparseable JSON. First 200: ${raw.slice(0, 200)}`); }

  return {
    data,
    usage: { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens },
    model,
  };
}
