// Week/date math now lives in shared/ so the web and the MCP coach can't drift
// (the calendar-date bug has been fixed twice). This module keeps the display
// helpers and re-exports the shared math under the web's original names.
export {
  parseCalendarDate,
  calculateCurrentWeek,
  getTodayDayName,
  getWeekDates,
} from '../../shared/week-math'

import { parseCalendarDate } from '../../shared/week-math'

/** Format a date to "Mon DD" format */
export const formatDate = (date) => {
  return parseCalendarDate(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

/** Format a date for display in program info */
export const formatProgramDate = (dateString) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
};
