import { describe, it, expect } from 'vitest';
import { createAppSettingsRepo } from './appSettings';
import { createMockSupabase } from '../../test/mockSupabase';

describe('appSettingsRepo', () => {
  it('getLlmProvider returns the rpc value', async () => {
    const sb = createMockSupabase();
    sb.respond('rpc.get_llm_provider', { data: 'claude', error: null });
    const repo = createAppSettingsRepo(sb);
    expect(await repo.getLlmProvider()).toBe('claude');
  });

  it('getLlmProvider falls back to openai on error', async () => {
    const sb = createMockSupabase();
    sb.respond('rpc.get_llm_provider', { data: null, error: { message: 'boom' } });
    const repo = createAppSettingsRepo(sb);
    expect(await repo.getLlmProvider()).toBe('openai');
  });

  it('saveAppSetting returns rpc result', async () => {
    const sb = createMockSupabase();
    sb.respond('rpc.save_app_setting', { data: true, error: null });
    const repo = createAppSettingsRepo(sb);
    expect(await repo.saveAppSetting('llm_provider', 'claude')).toBe(true);
  });
});
