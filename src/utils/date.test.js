import { describe, expect, it, vi } from 'vitest';
import { calculateCurrentWeek, formatDate, getWeekDates } from './date';

describe('date utilities', () => {
  it('treats YYYY-MM-DD program start dates as local calendar dates, not UTC instants', () => {
    const { start, end } = getWeekDates('2026-03-30', 13);

    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(5); // June
    expect(start.getDate()).toBe(22);
    expect(end.getFullYear()).toBe(2026);
    expect(end.getMonth()).toBe(5);
    expect(end.getDate()).toBe(28);
  });

  it('formats date-only strings without timezone backshifting the displayed day', () => {
    expect(formatDate('2026-03-30')).toBe('Mar 30');
  });

  it('calculates current week from the local calendar anchor', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 21, 12, 0, 0)); // Jun 21, 2026 local noon

    expect(calculateCurrentWeek('2026-03-30')).toBe(12);

    vi.useRealTimers();
  });
});
