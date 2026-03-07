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
  const today = new Date();
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const weeksSinceStart = Math.floor(
    (today.getTime() - start.getTime()) / msPerWeek
  );
  return (weeksSinceStart % 4) + 1;
}

/** Get today's day name (e.g. "Monday") */
export function getTodayName(): string {
  return DAY_NAMES[new Date().getDay()];
}

export { DAY_NAMES };
