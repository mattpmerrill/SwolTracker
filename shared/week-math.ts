const DAY_NAMES = [
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
 * Profile timezones are often null. Reminders and the MCP server already treat
 * America/Denver as the app default; the database function does the same.
 */
export const DEFAULT_TIME_ZONE = "America/Denver";

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

/** YYYY-MM-DD from the Date's local calendar parts, not its UTC instant. */
export function formatCalendarDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * True when Intl accepts the zone. An empty or padded string is not a zone
 * even if a future engine were lenient; invalid profile values must fall back.
 */
export function isValidTimeZone(timeZone: string): boolean {
  if (typeof timeZone !== "string" || timeZone.length === 0 || timeZone !== timeZone.trim()) {
    return false;
  }
  try {
    Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * The user's calendar date as a local Date (year/month/day at local midnight).
 *
 * The MCP process on Vercel runs in UTC. `new Date()` there is already tomorrow
 * from 18:00 America/Denver, and Sunday evening becomes next week's Monday.
 * Intl parts name the calendar date in the user's zone; building that date with
 * the local constructor keeps later getDay()/getDate() math off the process clock.
 */
export function todayInZone(timeZone: string, now: Date = new Date()): Date {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(now)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return new Date(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
}

export interface WeekClockOptions {
  now?: Date;
  timeZone?: string;
}

/**
 * Today as a local calendar Date. With a timeZone, that is the user's date.
 * Without one, it is the runtime's local date — the browser path is unchanged.
 */
function calendarToday(opts?: WeekClockOptions): Date {
  const now = opts?.now ?? new Date();
  if (opts?.timeZone) return todayInZone(opts.timeZone, now);
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Monday-aligned current week number (1-based) from a program start date. */
export function calculateCurrentWeek(
  programStartDate: string | Date | null,
  opts?: WeekClockOptions,
): number {
  if (!programStartDate) return 1;

  const start = parseCalendarDate(programStartDate);
  const dayOfWeek = start.getDay();
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  start.setDate(start.getDate() - daysToMonday);
  start.setHours(0, 0, 0, 0);

  const todayMidnight = calendarToday(opts);
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysElapsed = Math.round((todayMidnight.getTime() - start.getTime()) / msPerDay);
  const weeksElapsed = Math.floor(daysElapsed / 7);

  return Math.max(1, weeksElapsed + 1);
}

/** Today's day name, e.g. "Monday". See calendarToday for the zone rule. */
export function getTodayDayName(opts?: WeekClockOptions): string {
  return DAY_NAMES[calendarToday(opts).getDay()];
}

/** Monday-to-Sunday Date bounds for a program week (1-based). */
export function getWeekDates(
  programStartDate: string | Date,
  weekNumber: number,
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
