export const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parse a date for calendar math.
 *
 * JS parses bare YYYY-MM-DD strings as UTC instants, which shifts the date back
 * in negative timezones (e.g. 2026-03-30 becomes Mar 29 in MDT). Program start
 * dates are calendar dates, not moments, so date-only values must be built in
 * local time. This is the bug that was fixed twice (web + MCP separately) —
 * now there is exactly one copy.
 */
export function parseCalendarDate(value: string | Date): Date {
  if (value instanceof Date) return new Date(value);
  if (typeof value === "string") {
    const match = DATE_ONLY_RE.exec(value.trim());
    if (match) {
      const [, year, month, day] = match;
      return new Date(Number(year), Number(month) - 1, Number(day));
    }
  }
  return new Date(value as unknown as string);
}

/** Monday-aligned current week number (1-based) from a program start date. */
export function calculateCurrentWeek(programStartDate: string | Date | null): number {
  if (!programStartDate) return 1;

  const start = parseCalendarDate(programStartDate);
  const dayOfWeek = start.getDay();
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  start.setDate(start.getDate() - daysToMonday);
  start.setHours(0, 0, 0, 0);

  const today = new Date();
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysElapsed = Math.round((todayMidnight.getTime() - start.getTime()) / msPerDay);
  const weeksElapsed = Math.floor(daysElapsed / 7);

  return Math.max(1, weeksElapsed + 1);
}

/** Today's day name, e.g. "Monday". */
export function getTodayDayName(): string {
  return DAY_NAMES[new Date().getDay()];
}

/** Monday-to-Sunday Date bounds for a program week (1-based). */
export function getWeekDates(
  programStartDate: string | Date,
  weekNumber: number
): { start: Date; end: Date } {
  const start = parseCalendarDate(programStartDate);
  const dayOfWeek = start.getDay();
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  start.setDate(start.getDate() - daysToMonday + (weekNumber - 1) * 7);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { start, end };
}
