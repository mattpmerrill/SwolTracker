import { DAYS_OF_WEEK } from '../constants';

/**
 * Phase 3.7 — program continuity helpers.
 * Detect when the athlete needs a clear path from end-of-week → generate next.
 */

const LATE_WEEK_DAYS = new Set(['Thursday', 'Friday', 'Saturday', 'Sunday']);

/** First week number with no saved program (1-based). */
export function getNextUnprogrammedWeek(workoutProgram = {}) {
  let nextWeek = 1;
  while (workoutProgram[nextWeek]) nextWeek += 1;
  return nextWeek;
}

/**
 * Training days in a week program (non-empty, non-rest).
 * @returns {string[]} day names
 */
export function getScheduledTrainingDays(weekProgram) {
  if (!weekProgram || typeof weekProgram !== 'object') return [];
  return DAYS_OF_WEEK.filter((day) => {
    const slot = weekProgram[day];
    if (!slot) return false;
    if (slot.focus === 'Rest Day') return false;
    return Array.isArray(slot.exercises) && slot.exercises.length > 0;
  });
}

/**
 * Compact week summary for the Review + Generate banner.
 */
export function summarizeWeekTraining({
  weekProgram,
  weekNumber,
  userId,
  isWorkoutComplete,
  isWorkoutMissed,
}) {
  const scheduled = getScheduledTrainingDays(weekProgram);
  const completed = scheduled.filter((day) => isWorkoutComplete?.(weekNumber, day, userId));
  const missed = scheduled.filter((day) => !completed.includes(day) && isWorkoutMissed?.(weekNumber, day, userId));
  const remaining = scheduled.filter((day) => !completed.includes(day) && !missed.includes(day));

  return {
    weekNumber,
    scheduledDays: scheduled,
    completedDays: completed,
    missedDays: missed,
    remainingDays: remaining,
    allAccounted: scheduled.length > 0 && remaining.length === 0,
  };
}

/**
 * Show week-end Review + Generate when next calendar week has no program and
 * either training days are all done/skipped or we're late in the week.
 */
export function shouldPromptWeekEndReview({
  workoutProgram,
  actualCurrentWeek,
  todayDayName,
  userId,
  groupRole,
  isWorkoutComplete,
  isWorkoutMissed,
}) {
  if (groupRole === 'member') return false;
  if (!Number.isFinite(actualCurrentWeek) || actualCurrentWeek < 1) return false;

  const nextWeek = actualCurrentWeek + 1;
  if (workoutProgram?.[nextWeek]) return false;

  const currentProgram = workoutProgram?.[actualCurrentWeek];
  if (!currentProgram) return false;

  const summary = summarizeWeekTraining({
    weekProgram: currentProgram,
    weekNumber: actualCurrentWeek,
    userId,
    isWorkoutComplete,
    isWorkoutMissed,
  });

  // No scheduled training this week — nothing to "close out"
  if (summary.scheduledDays.length === 0) return false;

  const lateInWeek = LATE_WEEK_DAYS.has(todayDayName);
  return summary.allAccounted || lateInWeek;
}
