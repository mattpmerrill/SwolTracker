import { describe, it, expect } from 'vitest';
import { createPromptsRepo } from './prompts';
import { createMockSupabase } from '../../test/mockSupabase';

describe('promptsRepo', () => {
  it('getPromptTemplate returns rpc data', async () => {
    const sb = createMockSupabase();
    sb.respond('rpc.get_prompt_template', {
      data: { name: 'weekly', template: 'Hello {{name}}' },
      error: null,
    });
    const repo = createPromptsRepo(sb);
    const tpl = await repo.getPromptTemplate('weekly');
    expect(tpl?.template).toBe('Hello {{name}}');
  });

  it('createPromptTemplate returns the new id', async () => {
    const sb = createMockSupabase();
    sb.respond('rpc.create_prompt_template', { data: 't1', error: null });
    const repo = createPromptsRepo(sb);
    const id = await repo.createPromptTemplate('weekly', 'desc', 'body');
    expect(id).toBe('t1');
  });
});
