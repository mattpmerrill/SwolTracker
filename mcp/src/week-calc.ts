const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parse calendar-only program dates in local time.
 *
 * JavaScript parses bare YYYY-MM-DD strings as UTC instants. In negative
 * timezones that turns a Monday date into Sunday evening locally, which makes
 * week math snap to the previous Monday. Program start dates are calendar
 * dates, not moments, so build date-only values with the local constructor.
 */
export function parseCalendarDate(value: string | Date): Date {
  if (value instanceof Date) return new Date(value);

  const match = DATE_ONLY_RE.exec(value.trim());
  if (match) {
    const [, year, month, day] = match;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  return new Date(value);
}

/**
 * Calculate the current week number from a program start date.
 * Mirrors the web app's calendar-date week math.
 */
export function getCurrentWeek(programStartDate: string | null): number {
  if (!programStartDate) return 1;

  const start = parseCalendarDate(programStartDate);
  const dayOfWeek = start.getDay();
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  start.setDate(start.getDate() - daysToMonday);
  start.setHours(0, 0, 0, 0);

  const today = new Date();
  const todayMidnight = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );

  const msPerDay = 24 * 60 * 60 * 1000;
  const daysElapsed = Math.round(
    (todayMidnight.getTime() - start.getTime()) / msPerDay
  );
  const weeksElapsed = Math.floor(daysElapsed / 7);

  return Math.max(1, weeksElapsed + 1);
}

/** Get today's day name (e.g. "Monday") */
export function getTodayName(): string {
  return DAY_NAMES[new Date().getDay()];
}

export { DAY_NAMES };
