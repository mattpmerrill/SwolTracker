/**
 * Find the matching 1RM key for an exercise name
 * @param {string} exerciseName - The exercise name to match
 * @param {Object} maxes - Object containing 1RM values keyed by exercise name
 * @returns {string|null} The matching key or null if not found
 */
export const findMaxKey = (exerciseName, maxes) => {
  const lowerName = exerciseName.toLowerCase();
  const maxKeys = Object.keys(maxes);

  // First, try exact matching so variants like incline dumbbell press do not
  // accidentally resolve to incline bench press.
  for (const key of maxKeys) {
    if (key.toLowerCase() === lowerName) {
      return key;
    }
  }

  // Prefer known exercise-specific mappings before fuzzy matching.
  const mappings = {
    'push press': 'Push Press',
    'push jerk': 'Push Press',
    'power clean': 'Power Clean',
    'hang clean': 'Power Clean',
    'power snatch': 'Power Snatch',
    'hang snatch': 'Power Snatch',
    'snatch pull': 'Power Snatch',
    'clean & jerk': 'Power Clean',
    'thrusters': 'Front Squat',
    'dumbbell bench press': 'Dumbbell Bench Press',
    'incline dumbbell press': 'Incline Dumbbell Press',
    'seated dumbbell press': 'Overhead Press',
    'dumbbell overhead press': 'Overhead Press',
    'barbell rows': 'Barbell Rows',
    'cable rows': 'Barbell Rows',
    'seated cable rows': 'Barbell Rows',
    'sumo deadlift': 'Deadlift',
    'chest-supported dumbbell rows': 'Barbell Rows',
  };

  const mappedKey = mappings[lowerName];
  if (mappedKey) {
    const exactMappedKey = maxKeys.find((key) => key.toLowerCase() === mappedKey.toLowerCase());
    if (exactMappedKey) return exactMappedKey;
  }

  // Then allow full-name containment, but never match on just the first word.
  for (const key of maxKeys) {
    const lowerKey = key.toLowerCase();
    if (lowerName.includes(lowerKey) || lowerKey.includes(lowerName)) {
      return key;
    }
  }

  return mappedKey || null;
};

/**
 * Calculate the working weight based on percentage and 1RM
 * @param {number} percentage - The percentage of 1RM (e.g., 65, 70, 75)
 * @param {Object} maxes - Object containing 1RM values keyed by exercise name
 * @param {string} exerciseName - The exercise name to look up
 * @returns {number|null} The calculated weight rounded to nearest 5, or null if no max found
 */
export const calculateWeight = (percentage, maxes, exerciseName) => {
  const maxKey = findMaxKey(exerciseName, maxes);
  if (maxKey && maxes[maxKey]) {
    return Math.round(maxes[maxKey] * (percentage / 100) / 5) * 5;
  }
  return null;
};

/**
 * Calculate the completion percentage for a workout day
 * @param {Object} workoutProgram - The full workout program object
 * @param {Object} exerciseLog - The exercise log object
 * @param {number} week - The week number
 * @param {string} day - The day name
 * @param {string} targetUserId - The user ID to calculate completion for
 * @returns {number} The completion percentage (0-100)
 */
export const getCompletionPercentage = (workoutProgram, exerciseLog, week, day, targetUserId) => {
  if (!workoutProgram[week] || !workoutProgram[week][day] || !workoutProgram[week][day].exercises) {
    return 0;
  }

  const totalSets = workoutProgram[week][day].exercises.reduce((acc, exercise) => acc + exercise.sets, 0);
  if (totalSets === 0) return 0;

  let completedSets = 0;
  workoutProgram[week][day].exercises.forEach((exercise, exerciseIndex) => {
    for (let setIndex = 0; setIndex < exercise.sets; setIndex++) {
      const key = `${targetUserId}-${week}-${day}-${exerciseIndex}-${setIndex}`;
      if (exerciseLog[key]?.completed) {
        completedSets++;
      }
    }
  });

  return Math.round((completedSets / totalSets) * 100);
};

/**
 * Check if a specific set is logged as completed
 * @param {Object} exerciseLog - The exercise log object
 * @param {string} userId - The user ID
 * @param {number} week - The week number
 * @param {string} day - The day name
 * @param {number} exerciseIndex - The exercise index
 * @param {number} setIndex - The set index
 * @returns {boolean} Whether the set is completed
 */
export const isSetLogged = (exerciseLog, userId, week, day, exerciseIndex, setIndex) => {
  const key = `${userId}-${week}-${day}-${exerciseIndex}-${setIndex}`;
  return exerciseLog[key]?.completed || false;
};

/**
 * Get the total number of completed sets for a user
 * @param {Object} exerciseLog - The exercise log object
 * @param {string} userId - The user ID
 * @returns {number} Total completed sets
 */
export const getTotalCompletedSets = (exerciseLog, userId) => {
  return Object.keys(exerciseLog).filter(k => k.startsWith(userId) && exerciseLog[k]?.completed).length;
};

/**
 * Generate the exercise log key
 * @param {string} userId - The user ID
 * @param {number} week - The week number
 * @param {string} day - The day name
 * @param {number} exerciseIndex - The exercise index
 * @param {number} setIndex - The set index
 * @returns {string} The log key
 */
export const getExerciseLogKey = (userId, week, day, exerciseIndex, setIndex) => {
  return `${userId}-${week}-${day}-${exerciseIndex}-${setIndex}`;
};

export const toActualRepsValue = (reps) => {
  if (reps === null || reps === undefined || reps === '') return null;
  if (typeof reps === 'number') return Number.isFinite(reps) ? Math.trunc(reps) : null;
  if (typeof reps === 'string' && /^\d+$/.test(reps.trim())) return Number.parseInt(reps, 10);
  return null;
};

/** Persist this as actual_reps. An explicit override always wins. */
export const resolveLoggedReps = (prescribedReps, override) => {
  if (override !== null && override !== undefined && override !== '') return override;
  return prescribedReps;
};

/** Starting value for the inline reps editor. */
export const parseRepsDraft = (prescribedReps, override) => {
  if (typeof override === 'number' && Number.isFinite(override)) return override;
  return toActualRepsValue(prescribedReps) ?? 0;
};

/** True when the user changed reps off the numeric prescription (or entered a number on AMRAP/timed). */
export const isRepsAdjusted = (prescribedReps, override) => {
  if (override === null || override === undefined) return false;
  const prescribed = toActualRepsValue(prescribedReps);
  if (prescribed == null) return true;
  return override !== prescribed;
};

/**
 * Build log entries for any missing sets in a workout day.
 * Used when a user taps "Complete Workout" so the persisted set logs match
 * the completion marker that survives refresh.
 */
export const buildMissingWorkoutSetLogs = (workout, exerciseLog, userId, week, day) => {
  if (!workout?.exercises?.length) return [];

  const entries = [];
  workout.exercises.forEach((exercise, exerciseIndex) => {
    for (let setIndex = 0; setIndex < exercise.sets; setIndex++) {
      const key = getExerciseLogKey(userId, week, day, exerciseIndex, setIndex);
      if (exerciseLog[key]?.completed) continue;

      const prescribedWeight = exercise.weight_lbs ?? exercise.weight ?? null;
      const prescribedReps = exercise.reps ?? null;
      const actualReps = toActualRepsValue(prescribedReps);

      entries.push({
        key,
        exerciseIndex,
        setIndex,
        exerciseName: exercise.name || `Exercise ${exerciseIndex + 1}`,
        logData: {
          actualWeight: prescribedWeight,
          prescribedWeight,
          actualReps,
          prescribedReps,
          completed: true,
        },
      });
    }
  });

  return entries;
};
