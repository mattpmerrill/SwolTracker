import { describe, it, expect } from 'vitest';
import { isNewOnboardingEnabled } from './OnboardingRouter.flag';

describe('isNewOnboardingEnabled', () => {
  it('defaults to false when env is empty', () => {
    expect(isNewOnboardingEnabled({})).toBe(false);
  });

  it('returns false when flag is undefined', () => {
    expect(isNewOnboardingEnabled({ VITE_NEW_ONBOARDING_FLOW: undefined })).toBe(false);
  });

  it('returns false when flag is the string "false"', () => {
    expect(isNewOnboardingEnabled({ VITE_NEW_ONBOARDING_FLOW: 'false' })).toBe(false);
  });

  it('returns false when flag is the string "0"', () => {
    expect(isNewOnboardingEnabled({ VITE_NEW_ONBOARDING_FLOW: '0' })).toBe(false);
  });

  it('returns true when flag is the string "true"', () => {
    expect(isNewOnboardingEnabled({ VITE_NEW_ONBOARDING_FLOW: 'true' })).toBe(true);
  });

  it('accepts mixed-case "True"', () => {
    expect(isNewOnboardingEnabled({ VITE_NEW_ONBOARDING_FLOW: 'True' })).toBe(true);
  });

  it('returns true when flag is the string "1"', () => {
    expect(isNewOnboardingEnabled({ VITE_NEW_ONBOARDING_FLOW: '1' })).toBe(true);
  });

  it('returns true when flag is the boolean true', () => {
    expect(isNewOnboardingEnabled({ VITE_NEW_ONBOARDING_FLOW: true })).toBe(true);
  });

  it('tolerates a null env object', () => {
    expect(isNewOnboardingEnabled(null)).toBe(false);
  });
});
