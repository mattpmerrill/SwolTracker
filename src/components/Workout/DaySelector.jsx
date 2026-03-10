import { DAYS_OF_WEEK } from '../../constants';
import { getTodayDayName } from '../../utils/date';

/**
 * Day selector with buttons for each day of the week.
 * Shows completion dot when a day's workout is marked complete.
 */
export default function DaySelector({
  currentDay,
  currentWeek,
  actualCurrentWeek,
  weekDates,
  onDayChange,
  isWorkoutComplete,
  workoutProgram,
  userId,
}) {
  const todayDayName = getTodayDayName();

  return (
    <div className="flex gap-2 overflow-x-auto pb-4 -mx-5 px-5 scrollbar-hide">
      {DAYS_OF_WEEK.map((day, idx) => {
        const dayDate = new Date(weekDates.start);
        dayDate.setDate(dayDate.getDate() + idx);
        const isToday = currentWeek === actualCurrentWeek && day === todayDayName;
        const isSelected = currentDay === day;
        const hasWorkout = workoutProgram?.[currentWeek]?.[day]?.exercises?.length > 0;
        const isDone = hasWorkout && isWorkoutComplete?.(currentWeek, day, userId);

        return (
          <button
            key={day}
            onClick={() => onDayChange(day)}
            className={`relative flex-shrink-0 px-4 py-2.5 rounded-xl font-medium text-sm transition-all ${
              isSelected
                ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-lg shadow-orange-500/25'
                : isToday
                  ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                  : 'bg-zinc-800/60 text-zinc-400 hover:bg-zinc-700/60'
            }`}
          >
            <div>{day.slice(0, 3)}</div>
            <div className="text-xs opacity-70">{dayDate.getDate()}</div>
            {/* Completion dot */}
            {isDone && (
              <span
                className={`absolute top-1 right-1 w-2 h-2 rounded-full ${
                  isSelected ? 'bg-white/80' : 'bg-green-400'
                }`}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
