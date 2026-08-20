/** Prompt size + public error mapping for /api/llm (slice 5.2). */

export const MAX_PROMPT_BYTES = 80_000;
export const MAX_COMBINED_PROMPT_BYTES = 120_000;

export function utf8Bytes(value) {
  return new TextEncoder().encode(String(value ?? '')).length;
}

export function isPromptTooLarge(systemPrompt, userPrompt) {
  const systemBytes = utf8Bytes(systemPrompt);
  const userBytes = utf8Bytes(userPrompt);
  return (
    systemBytes > MAX_PROMPT_BYTES
    || userBytes > MAX_PROMPT_BYTES
    || systemBytes + userBytes > MAX_COMBINED_PROMPT_BYTES
  );
}

/** Map provider/internal errors to a client-safe { status, error }. Never leak raw messages. */
export function publicLlmError(error) {
  const msg = String(error?.message || '').toLowerCase();
  if (msg.includes('timeout') || error?.name === 'AbortError') {
    return { status: 504, error: 'The AI service timed out. Try again.' };
  }
  if (msg.includes('429') || msg.includes('rate limit')) {
    return { status: 429, error: 'The AI service is rate limited. Try again shortly.' };
  }
  if (msg.includes('401') || msg.includes('api key') || msg.includes('invalid key')) {
    return { status: 502, error: 'The AI service rejected the request. Try again later.' };
  }
  return { status: 500, error: 'Failed to generate. Try again.' };
}
