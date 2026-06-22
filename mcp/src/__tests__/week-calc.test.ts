import { describe, expect, it, vi } from 'vitest';
import { getCurrentWeek, parseCalendarDate } from '../week-calc';

describe('MCP week calculation', () => {
  it('parses YYYY-MM-DD program starts as local calendar dates', () => {
    const parsed = parseCalendarDate('2026-03-30');

    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(2); // March
    expect(parsed.getDate()).toBe(30);
    expect(parsed.getDay()).toBe(1); // Monday
  });

  it('keeps Aleesha Week 13 anchored to Monday June 22, 2026', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 22, 12, 0, 0)); // Jun 22, 2026 local noon

    expect(getCurrentWeek('2026-03-30')).toBe(13);

    vi.useRealTimers();
  });
});
