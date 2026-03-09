const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/**
 * Calculate the current week number (1-4 cycling) from a program start date.
 * Mirrors the web app: weeksSinceStart % 4 + 1
 */
export function getCurrentWeek(programStartDate: string | null): number {
  if (!programStartDate) return 1;

  const start = new Date(programStartDate);
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
