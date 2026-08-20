import { describe, it, expect } from 'vitest';
import {
  utf8Bytes,
  isPromptTooLarge,
  publicLlmError,
  MAX_PROMPT_BYTES,
} from './_llm-guard.js';

describe('utf8Bytes / isPromptTooLarge', () => {
  it('counts UTF-8 bytes', () => {
    expect(utf8Bytes('abc')).toBe(3);
    expect(utf8Bytes('é')).toBe(2);
  });

  it('rejects oversized prompts', () => {
    expect(isPromptTooLarge('sys', 'user')).toBe(false);
    const huge = 'x'.repeat(MAX_PROMPT_BYTES + 1);
    expect(isPromptTooLarge(huge, 'ok')).toBe(true);
    expect(isPromptTooLarge('ok', huge)).toBe(true);
  });
});

describe('publicLlmError', () => {
  it('does not leak raw provider messages', () => {
    const mapped = publicLlmError(new Error('Invalid API key sk-secret-abc'));
    expect(mapped.status).toBe(502);
    expect(mapped.error).not.toMatch(/sk-secret/);
    expect(mapped.error).not.toMatch(/Invalid API key/);
  });

  it('maps timeout and rate limit', () => {
    expect(publicLlmError(new Error('timeout after 270s')).status).toBe(504);
    expect(publicLlmError(new Error('429 rate limit')).status).toBe(429);
  });
});
