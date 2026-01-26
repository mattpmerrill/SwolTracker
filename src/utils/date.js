/**
 * Format a date to "Mon DD" format
 * @param {Date|string} date - The date to format
 * @returns {string} Formatted date string
 */
export const formatDate = (date) => {
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

/**
 * Get the start and end dates for a given week number based on program start date
 * @param {string} programStartDate - ISO date string for program start
 * @param {number} weekNumber - The week number (1-based)
 * @returns {{ start: Date, end: Date }} Start and end dates for the week
 */
export const getWeekDates = (programStartDate, weekNumber) => {
  const start = new Date(programStartDate);
  start.setDate(start.getDate() + (weekNumber - 1) * 7);
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
  const startDate = new Date(programStartDate);
  const today = new Date();
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const weeksElapsed = Math.floor((today - startDate) / msPerWeek);
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
