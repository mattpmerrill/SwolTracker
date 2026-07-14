import { Brain, CalendarCheck, TrendingUp, X } from 'lucide-react';

/**
 * Phase 3.7 — proactive week-end continuity card.
 * Surfaces when the next week has no program and the current week is
 * wrapping up; opens the Review + Generate flow for the next week.
 */
export default function WeekEndReviewCard({
  currentWeek,
  nextWeek,
  summary,
  overloadCount = 0,
  onReviewAndGenerate,
  onDismiss,
}) {
  if (!summary) return null;

  const { completedDays, missedDays, remainingDays, scheduledDays } = summary;

  return (
    <div className="mb-5 rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/10 via-zinc-900 to-zinc-900 p-4 shadow-lg shadow-emerald-500/5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shrink-0">
            <CalendarCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400/90">
              Week-end review
            </p>
            <h3 className="text-base font-bold text-white leading-tight">
              Plan Week {nextWeek} before you lose momentum
            </h3>
          </div>
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/80 transition-colors"
            aria-label="Dismiss week-end review"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <p className="text-sm text-zinc-400 mb-3">
        Week {currentWeek} is wrapping up and Week {nextWeek} has no program yet.
        Review what you actually trained, then generate the next block with that context.
      </p>

      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="rounded-xl bg-zinc-800/60 border border-zinc-700/40 px-2 py-2 text-center">
          <p className="text-lg font-bold text-green-400">{completedDays.length}</p>
          <p className="text-[10px] uppercase tracking-wide text-zinc-500">Done</p>
        </div>
        <div className="rounded-xl bg-zinc-800/60 border border-zinc-700/40 px-2 py-2 text-center">
          <p className="text-lg font-bold text-amber-400">{missedDays.length}</p>
          <p className="text-[10px] uppercase tracking-wide text-zinc-500">Skipped</p>
        </div>
        <div className="rounded-xl bg-zinc-800/60 border border-zinc-700/40 px-2 py-2 text-center">
          <p className="text-lg font-bold text-zinc-300">{remainingDays.length}</p>
          <p className="text-[10px] uppercase tracking-wide text-zinc-500">Left</p>
        </div>
      </div>

      <p className="text-xs text-zinc-500 mb-3">
        {scheduledDays.length} training day{scheduledDays.length === 1 ? '' : 's'} scheduled this week
        {overloadCount > 0 ? (
          <span className="text-emerald-400/90">
            {' '}· {overloadCount} overload signal{overloadCount === 1 ? '' : 's'} ready for the coach
          </span>
        ) : null}
      </p>

      {missedDays.length > 0 && (
        <p className="text-xs text-amber-300/90 mb-3">
          Skipped: {missedDays.join(', ')} — the generator will factor these in.
        </p>
      )}

      <button
        type="button"
        onClick={onReviewAndGenerate}
        className="w-full py-3.5 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 font-semibold hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-green-500/20"
      >
        <Brain className="w-5 h-5" />
        Review + Generate Week {nextWeek}
      </button>

      {overloadCount > 0 && (
        <p className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-zinc-500">
          <TrendingUp className="w-3 h-3 text-emerald-400" />
          Progressive overload recs load in the review step
        </p>
      )}
    </div>
  );
}
