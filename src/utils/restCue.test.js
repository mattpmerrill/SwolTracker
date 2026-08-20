import { describe, it, expect } from 'vitest';
import { getRestSeconds } from './restCue';

describe('getRestSeconds', () => {
  it('maps strength / hypertrophy / conditioning bands', () => {
    expect(getRestSeconds('3')).toBe(180);
    expect(getRestSeconds('5')).toBe(150);
    expect(getRestSeconds('8')).toBe(90);
    expect(getRestSeconds('12')).toBe(60);
  });

  it('accepts a digit plus a short unit token', () => {
    expect(getRestSeconds('5 reps')).toBe(150);
    expect(getRestSeconds('30s')).toBe(60);
  });

  it('falls back to 60s for polluted or missing reps strings', () => {
    expect(getRestSeconds(null)).toBe(60);
    expect(getRestSeconds('5 warmup, 3 warmup, then 1 rep attempts')).toBe(60);
    expect(getRestSeconds('AMRAP')).toBe(60);
  });
});
