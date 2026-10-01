import { describe, it, expect } from 'vitest';
import { isAppError } from '@bot-native/sdk';
import { z } from 'zod';
import { inferLegacyErrorCode, legacyErrorEnvelope, buildApp } from '../sdk-adapter.js';
import { createMcpMockSupabase } from './mockSupabase.js';

describe('inferLegacyErrorCode', () => {
  it('maps "not found" variants to not_found', () => {
    expect(inferLegacyErrorCode('Profile not found.')).toBe('not_found');
    expect(inferLegacyErrorCode('No gym found.')).toBe('not_found');
    expect(inferLegacyErrorCode("Record doesn't exist")).toBe('not_found');
  });

  it('maps permission vocabulary to forbidden', () => {
    expect(inferLegacyErrorCode('Permission denied')).toBe('forbidden');
    expect(inferLegacyErrorCode('Not allowed to update this record')).toBe('forbidden');
  });

  it('maps rate-limit vocabulary to rate_limited', () => {
    expect(inferLegacyErrorCode('Rate limit exceeded')).toBe('rate_limited');
    expect(inferLegacyErrorCode('Too many requests')).toBe('rate_limited');
  });

  it('maps duplicate/conflict vocabulary to conflict', () => {
    expect(inferLegacyErrorCode('Workout already logged')).toBe('conflict');
    expect(inferLegacyErrorCode('Duplicate entry')).toBe('conflict');
  });

  it('maps validation vocabulary to invalid_args', () => {
    expect(inferLegacyErrorCode('week1 and week2 must be different.')).toBe('invalid_args');
    expect(inferLegacyErrorCode('Invalid parameter')).toBe('invalid_args');
    expect(inferLegacyErrorCode('exercise_name is required')).toBe('invalid_args');
  });

  it('falls back to internal for ambiguous messages', () => {
    expect(inferLegacyErrorCode('Something went wrong')).toBe('internal');
    expect(inferLegacyErrorCode('Supabase error: connection reset')).toBe('internal');
  });
});

describe('legacyErrorEnvelope', () => {
  it('returns non-retryable for domain failures', () => {
    expect(legacyErrorEnvelope('Profile not found.').retryable).toBe(false);
    expect(legacyErrorEnvelope('Permission denied').retryable).toBe(false);
    expect(legacyErrorEnvelope('Invalid input').retryable).toBe(false);
  });

  it('returns retryable for rate_limited and internal', () => {
    expect(legacyErrorEnvelope('Rate limit exceeded').retryable).toBe(true);
    expect(legacyErrorEnvelope('Unknown error').retryable).toBe(true);
  });
});

describe('buildApp end-to-end envelope shape', () => {
  it('get_profile with missing profile throws AppError.notFound (envelope produced by SDK registerTool)', async () => {
    const sb = createMcpMockSupabase();
    const app = buildApp(sb as any);
    const tool = app.tools.find((t) => t.name === 'get_profile')!;
    await expect(
      tool.execute(
        {},
        {
          request: { identity: { userId: 'u1' }, requestId: 'r1', transport: 'http' },
          app,
        }
      )
    ).rejects.toSatisfy((e: unknown) => {
      if (!isAppError(e)) return false;
      return e.code === 'not_found' && e.message === 'Profile not found.' && e.retryable === false;
    });
  });

  it('successful query tools do not attach an error field', async () => {
    const sb = createMcpMockSupabase();
    sb.respond('current_user_maxes.list', {
      data: [{ user_id: 'u1', exercise_name: 'Squat', weight_lbs: 315 }],
      error: null,
    });
    const app = buildApp(sb as any);
    const tool = app.tools.find((t) => t.name === 'get_maxes')!;
    const result = await tool.execute(
      {},
      {
        request: { identity: { userId: 'u1' }, requestId: 'r1', transport: 'http' },
        app,
      }
    );
    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();
  });
});

describe('tool list: program start date is write-once', () => {
  const app = buildApp(createMcpMockSupabase() as any);

  it('does not register shift_program', () => {
    expect(app.tools.map((t) => t.name)).not.toContain('shift_program');
  });

  it('registers 43 tools with unique names', () => {
    const names = app.tools.map((t) => t.name);
    expect(names).toHaveLength(43);
    expect(new Set(names).size).toBe(names.length);
  });

  it('update_profile declares program_start_date as always-invalid (so the SDK cannot strip it); complete_onboarding accepts it', () => {
    const updateProfile = app.tools.find((t) => t.name === 'update_profile')!;
    const completeOnboarding = app.tools.find((t) => t.name === 'complete_onboarding')!;
    const updateSchema = z.object(updateProfile.schema);
    expect(Object.keys(updateProfile.schema)).toContain('program_start_date');
    expect(updateSchema.safeParse({ age: 36 }).success).toBe(true);
    for (const input of [
      { program_start_date: '2026-05-04' },
      { age: 36, program_start_date: '2026-05-04' },
    ]) {
      const parsed = updateSchema.safeParse(input);
      expect(parsed.success).toBe(false);
      expect(JSON.stringify(parsed.error?.issues)).toContain("program_start_date can't be changed after onboarding");
    }
    expect(z.object(completeOnboarding.schema).safeParse({ program_start_date: '2026-05-04' }).success).toBe(true);
  });
});
