const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parse a date for calendar math.
 *
 * JS parses bare YYYY-MM-DD strings as UTC instants, which shifts the date back
 * in negative timezones (for example 2026-03-30 becomes Mar 29 in MDT). Program
 * start dates are calendar dates, not moments, so date-only values must be
 * constructed in local time before week/date-label math.
 *
 * @param {Date|string} value
 * @returns {Date}
 */
export const parseCalendarDate = (value) => {
  if (value instanceof Date) return new Date(value);

  if (typeof value === 'string') {
    const trimmed = value.trim();
    const match = DATE_ONLY_RE.exec(trimmed);
    if (match) {
      const [, year, month, day] = match;
      return new Date(Number(year), Number(month) - 1, Number(day));
    }
  }

  return new Date(value);
};

/**
 * Format a date to "Mon DD" format
 * @param {Date|string} date - The date to format
 * @returns {string} Formatted date string
 */
export const formatDate = (date) => {
  return parseCalendarDate(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

/**
 * Get the start and end dates for a given week number based on program start date
 * @param {string} programStartDate - ISO date string for program start
 * @param {number} weekNumber - The week number (1-based)
 * @returns {{ start: Date, end: Date }} Start and end dates for the week
 */
export const getWeekDates = (programStartDate, weekNumber) => {
  const start = parseCalendarDate(programStartDate);
  const dayOfWeek = start.getDay();
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  start.setDate(start.getDate() - daysToMonday + (weekNumber - 1) * 7);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  return { start, end };
};

/**
 * Calculate the current week number based on program start date
 * @param {string} programStartDate - ISO date string for program start
 * @returns {number} The current week number (1-based)
 */
export const calculateCurrentWeek = (programStartDate) => {
  const startDate = parseCalendarDate(programStartDate);
  const dayOfWeek = startDate.getDay();
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  startDate.setDate(startDate.getDate() - daysToMonday);
  startDate.setHours(0, 0, 0, 0);

  const today = new Date();
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysElapsed = Math.round((todayMidnight - startDate) / msPerDay);
  const weeksElapsed = Math.floor(daysElapsed / 7);

  return Math.max(1, weeksElapsed + 1);
};

/**
 * Get today's day name
 * @returns {string} Today's day name (e.g., "Monday")
 */
export const getTodayDayName = () => {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[new Date().getDay()];
};

/**
 * Format a date for display in program info
 * @param {string} dateString - ISO date string
 * @returns {string} Formatted date string
 */
export const formatProgramDate = (dateString) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
};
