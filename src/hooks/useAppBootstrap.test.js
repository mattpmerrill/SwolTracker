import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { isBootstrapLoadError, resolveProgramStart } from './useAppBootstrap';

describe('isBootstrapLoadError', () => {
  it('is true when the first load failed and there is no bundle', () => {
    expect(isBootstrapLoadError(new Error('network'), null)).toBe(true);
  });

  it('is false while a previous bundle is still on screen (reload failed)', () => {
    expect(isBootstrapLoadError(new Error('network'), { kind: 'ready' })).toBe(false);
  });

  it('is false with no error', () => {
    expect(isBootstrapLoadError(null, null)).toBe(false);
  });
});

describe('resolveProgramStart', () => {
  const originalTz = process.env.TZ;

  beforeAll(() => {
    // West of UTC is where the stored date used to slip back to Sunday.
    process.env.TZ = 'America/Denver';
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 30, 12)); // Wednesday 2026-09-30, local noon
  });

  afterAll(() => {
    vi.useRealTimers();
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it('counts a Monday start in the right week west of UTC', () => {
    expect(resolveProgramStart('2026-09-07')).toEqual({ programStartDate: '2026-09-07', currentWeek: 4 });
  });

  it('starts at week 1 when no start date is stored', () => {
    expect(resolveProgramStart(null).currentWeek).toBe(1);
  });
});
