import { describe, expect, it, vi } from 'vitest';
import { calculateCurrentWeek } from '../utils/date';
import { getCurrentWeekFromStartDate } from './insightsHelpers';

describe('getCurrentWeekFromStartDate', () => {
  it('uses Monday-aligned local calendar weeks, not elapsed UTC milliseconds', () => {
    vi.useFakeTimers();
    // Program starts Wednesday Apr 1. The next Monday (Apr 6) is week 2
    // on the workout calendar, but only 5 days later by raw elapsed-ms.
    vi.setSystemTime(new Date(2026, 3, 6, 12, 0, 0)); // Apr 6, 2026 local noon

    expect(calculateCurrentWeek('2026-04-01')).toBe(2);
    expect(getCurrentWeekFromStartDate('2026-04-01')).toBe(2);
    expect(getCurrentWeekFromStartDate('2026-04-01')).toBe(
      calculateCurrentWeek('2026-04-01'),
    );

    vi.useRealTimers();
  });

  it('returns week 1 when the program start date is missing or invalid', () => {
    expect(getCurrentWeekFromStartDate(null)).toBe(1);
    expect(getCurrentWeekFromStartDate(undefined)).toBe(1);
    expect(getCurrentWeekFromStartDate('not-a-date')).toBe(1);
  });
});
