// Date utilities
export {
  formatDate,
  getWeekDates,
  calculateCurrentWeek,
  getTodayDayName,
  formatProgramDate,
} from './date';

// Workout utilities
export {
  findMaxKey,
  calculateWeight,
  getCompletionPercentage,
  isSetLogged,
  getTotalCompletedSets,
  getExerciseLogKey,
} from './workout';

// Storage utilities
export {
  getItem,
  setItem,
  removeItem,
  getString,
  setString,
  loadAllData,
  saveAllData,
  clearAllData,
  STORAGE_KEYS,
} from './storage';
