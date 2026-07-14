import { describe, it, expect } from 'vitest';
import { isNewOnboardingEnabled } from './OnboardingRouter.flag';

describe('isNewOnboardingEnabled', () => {
  it('defaults to true when env is empty (Phase 1.3 product path)', () => {
    expect(isNewOnboardingEnabled({})).toBe(true);
  });

  it('returns true when flag is undefined', () => {
    expect(isNewOnboardingEnabled({ VITE_NEW_ONBOARDING_FLOW: undefined })).toBe(true);
  });

  it('returns false when flag is the string "false" (kill switch)', () => {
    expect(isNewOnboardingEnabled({ VITE_NEW_ONBOARDING_FLOW: 'false' })).toBe(false);
  });

  it('returns false when flag is the string "0"', () => {
    expect(isNewOnboardingEnabled({ VITE_NEW_ONBOARDING_FLOW: '0' })).toBe(false);
  });

  it('returns false when flag is "legacy" or "off"', () => {
    expect(isNewOnboardingEnabled({ VITE_NEW_ONBOARDING_FLOW: 'legacy' })).toBe(false);
    expect(isNewOnboardingEnabled({ VITE_NEW_ONBOARDING_FLOW: 'off' })).toBe(false);
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

  it('returns false when flag is the boolean false', () => {
    expect(isNewOnboardingEnabled({ VITE_NEW_ONBOARDING_FLOW: false })).toBe(false);
  });

  it('defaults to true for a null env object', () => {
    expect(isNewOnboardingEnabled(null)).toBe(true);
  });

  it('treats empty string as new path (on)', () => {
    expect(isNewOnboardingEnabled({ VITE_NEW_ONBOARDING_FLOW: '' })).toBe(true);
  });
});
