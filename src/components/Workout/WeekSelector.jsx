import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatDate } from '../../utils/date';
import { DAYS_OF_WEEK } from '../../constants';

/**
 * Week navigation with date range display and weekly adherence progress bar.
 */
export default function WeekSelector({
  currentWeek,
  actualCurrentWeek,
  weekDates,
  onPreviousWeek,
  onNextWeek,
  workoutProgram,
  isWorkoutComplete,
  userId,
  minAvailableWeek = 1,
  maxAvailableWeek = actualCurrentWeek,
}) {
  // Count days with workouts this week and how many are completed
  const programmedDays = DAYS_OF_WEEK.filter(
    day => workoutProgram?.[currentWeek]?.[day]?.exercises?.length > 0
  );
  const completedDays = programmedDays.filter(
    day => isWorkoutComplete?.(currentWeek, day, userId)
  );
  const total = programmedDays.length;
  const done = completedDays.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between">
        <button
          onClick={onPreviousWeek}
          className="w-10 h-10 rounded-xl bg-zinc-800/80 flex items-center justify-center hover:bg-zinc-700 transition-colors disabled:opacity-30"
          disabled={currentWeek <= minAvailableWeek}
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="text-center">
          <span className="text-xs font-semibold text-orange-500 uppercase tracking-wider">
            {formatDate(weekDates.start)} - {formatDate(weekDates.end)}
          </span>
          <h2 className="text-2xl font-bold">Week {currentWeek}</h2>
          {currentWeek === actualCurrentWeek && (
            <span className="text-xs text-green-400 font-medium">Current Week</span>
          )}
        </div>
        <button
          onClick={onNextWeek}
          className="w-10 h-10 rounded-xl bg-zinc-800/80 flex items-center justify-center hover:bg-zinc-700 transition-colors disabled:opacity-30"
          disabled={currentWeek >= maxAvailableWeek}
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Weekly adherence progress bar */}
      {total > 0 && (
        <div className="mt-3 px-1">
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs text-zinc-500">Weekly progress</span>
            <span className={`text-xs font-semibold ${pct === 100 ? 'text-green-400' : 'text-zinc-400'}`}>
              {done}/{total} workouts{pct === 100 ? ' ✓' : ''}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                pct === 100
                  ? 'bg-green-400'
                  : 'bg-gradient-to-r from-orange-500 to-red-500'
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
