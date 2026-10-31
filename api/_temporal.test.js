import { describe, it, expect } from 'vitest';
import { ApplicationFailure, WorkflowUpdateFailedError, WorkflowUpdateRPCTimeoutOrCancelledError } from '@temporalio/client';
import { classifyTemporalError, getTemporalClient, isTemporalConfigured } from './_temporal.js';

describe('isTemporalConfigured', () => {
  it('needs an address and a namespace', () => {
    expect(isTemporalConfigured({})).toBe(false);
    expect(isTemporalConfigured({ TEMPORAL_ADDRESS: 'a:7233' })).toBe(false);
    expect(isTemporalConfigured({ TEMPORAL_NAMESPACE: 'ns' })).toBe(false);
    expect(isTemporalConfigured({ TEMPORAL_ADDRESS: 'a:7233', TEMPORAL_NAMESPACE: 'ns' })).toBe(true);
  });
});

describe('getTemporalClient', () => {
  it('refuses to talk to Temporal Cloud (an API key) without the payload codec key, before any network', async () => {
    const env = { TEMPORAL_ADDRESS: 'ns.acct.tmprl.cloud:7233', TEMPORAL_NAMESPACE: 'ns.acct', TEMPORAL_API_KEY: 'not-a-real-key' };
    await expect(getTemporalClient(env)).rejects.toThrow(/CHECKIN_CODEC_KEY/);
    // Not cached: the next call fails the same way instead of returning a half-made client.
    await expect(getTemporalClient(env)).rejects.toThrow(/CHECKIN_CODEC_KEY/);
  });
});

describe('classifyTemporalError', () => {
  const updateFailed = (cause) => new WorkflowUpdateFailedError('Update failed', cause);
  const nested = (type, depth) => {
    let cause = ApplicationFailure.nonRetryable('x', type);
    for (let i = 1; i < depth; i += 1) cause = Object.assign(new Error('wrapper'), { cause });
    return cause;
  };

  it('a validator or handler refusal (an ApplicationFailure straight under the update) is rejected, whatever its type', () => {
    expect(classifyTemporalError(updateFailed(nested('Stale', 1)))).toBe('rejected');
    expect(classifyTemporalError(updateFailed(nested('Conflict', 1)))).toBe('rejected');
  });

  it('walks the cause chain to the activity\'s permanent answer', () => {
    for (const type of ['Conflict', 'BadRequest', 'NotFound']) {
      expect(classifyTemporalError(updateFailed(nested(type, 2))), type).toBe('rejected');
      expect(classifyTemporalError(updateFailed(nested(type, 3))), type).toBe('rejected');
    }
    expect(classifyTemporalError(updateFailed(nested('NotEligible', 2)))).toBe('ineligible');
    expect(classifyTemporalError(updateFailed(nested('NotEligible', 1)))).toBe('ineligible');
  });

  it('a temporary failure type, or no ApplicationFailure at all, is failed', () => {
    expect(classifyTemporalError(updateFailed(nested('ServiceUnavailable', 2)))).toBe('failed');
    expect(classifyTemporalError(updateFailed(new Error('timeout')))).toBe('failed');
    expect(classifyTemporalError(updateFailed(undefined))).toBe('failed');
  });

  it('timeouts and an unreachable server are offline; anything else is error', () => {
    expect(classifyTemporalError(new WorkflowUpdateRPCTimeoutOrCancelledError('t'))).toBe('offline');
    expect(classifyTemporalError(Object.assign(new Error('x'), { code: 14, details: 'unavailable', metadata: {} }))).toBe('offline');
    expect(classifyTemporalError(new Error('who knows'))).toBe('error');
    expect(classifyTemporalError(undefined)).toBe('error');
  });
});
