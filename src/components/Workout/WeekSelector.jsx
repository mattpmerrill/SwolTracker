import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatDate } from '../../utils/date';

/**
 * Week navigation with date range display
 */
export default function WeekSelector({
  currentWeek,
  actualCurrentWeek,
  weekDates,
  onPreviousWeek,
  onNextWeek,
}) {
  return (
    <div className="flex items-center justify-between mb-6">
      <button
        onClick={onPreviousWeek}
        className="w-10 h-10 rounded-xl bg-zinc-800/80 flex items-center justify-center hover:bg-zinc-700 transition-colors disabled:opacity-30"
        disabled={currentWeek === 1}
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
        disabled={currentWeek >= actualCurrentWeek + 1}
      >
        <ChevronRight className="w-5 h-5" />
      </button>
    </div>
  );
}
