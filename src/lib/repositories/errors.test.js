import { describe, it, expect } from 'vitest';
import { createErrorsRepo } from './errors';
import { createMockSupabase } from '../../test/mockSupabase';

describe('errorsRepo', () => {
  it('logError returns the new error id from rpc', async () => {
    const sb = createMockSupabase();
    sb.respond('rpc.log_error', { data: 'e1', error: null });
    const repo = createErrorsRepo(sb);
    const id = await repo.logError('llm', 'timeout', 'error', 'u1', 'llm.js', 'generate', null, {});
    expect(id).toBe('e1');
  });

  it('getErrorLogs returns rpc rows', async () => {
    const sb = createMockSupabase();
    sb.respond('rpc.get_error_logs', {
      data: [{ id: 'e1', category: 'llm', message: 'boom' }],
      error: null,
    });
    const repo = createErrorsRepo(sb);
    const logs = await repo.getErrorLogs({ limit: 10 });
    expect(logs).toHaveLength(1);
    expect(logs[0].category).toBe('llm');
  });
});
