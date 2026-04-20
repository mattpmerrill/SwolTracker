import { describe, it, expect, vi } from 'vitest';
import { createOnboardingRepo } from './onboarding';
import { createMockSupabase } from '../../test/mockSupabase';

describe('onboardingRepo', () => {
  it('completeOnboarding forwards fields to the rpc and returns true', async () => {
    const sb = createMockSupabase();
    sb.respond('rpc.complete_onboarding', { data: true, error: null });
    const repo = createOnboardingRepo(sb, { getProfile: vi.fn() });
    const ok = await repo.completeOnboarding('u1', {
      displayName: 'Matt',
      gender: 'male',
      age: 40,
      weightLbs: 180,
      fitnessGoals: ['strength'],
      workoutDays: ['Mon', 'Wed'],
      workoutDuration: 60,
      workoutLocation: 'home',
      equipment: ['barbell'],
    });
    expect(ok).toBe(true);
    const rpcCall = sb.calls.find((c) => c[0] === 'rpc' && c[1] === 'complete_onboarding');
    expect(rpcCall?.[2]?.p_display_name).toBe('Matt');
  });

  it('isOnboardingCompleted delegates to injected getProfile', async () => {
    const sb = createMockSupabase();
    const getProfile = vi.fn(async () => ({ onboarding_completed: true }));
    const repo = createOnboardingRepo(sb, { getProfile });
    expect(await repo.isOnboardingCompleted('u1')).toBe(true);
    expect(getProfile).toHaveBeenCalledWith('u1');
  });
});
