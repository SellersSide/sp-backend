const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL = 'claude-opus-4-5';
const MAX_TOKENS = 4096;

/**
 * Core wrapper — all routes call this.
 * Returns parsed JSON from Claude or throws.
 */
async function callClaude({ systemPrompt, userMessage, expectJson = true }) {
  const messages = [{ role: 'user', content: userMessage }];

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
    messages,
  });

  const raw = response.content?.[0]?.text ?? '';

  if (!expectJson) return raw;

  // Strip markdown fences if present
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    throw new Error(`Claude returned non-JSON: ${cleaned.slice(0, 200)}`);
  }
}

module.exports = { callClaude };
