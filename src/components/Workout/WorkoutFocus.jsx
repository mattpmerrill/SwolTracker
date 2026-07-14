import { useState } from 'react';
import { Check, RotateCcw, CalendarOff, Undo2 } from 'lucide-react';

const SKIP_REASONS = [
  { id: 'life', label: 'Life' },
  { id: 'travel', label: 'Travel' },
  { id: 'illness', label: 'Illness' },
  { id: 'injury', label: 'Injury' },
  { id: 'rest', label: 'Rest' },
];

/**
 * Today's workout focus card with completion ring + skip/missed controls.
 */
export default function WorkoutFocus({
  currentDay,
  workout,
  completionPercentage,
  isWorkoutComplete,
  isWorkoutMissed = false,
  missedReason = null,
  onToggleComplete,
  onMarkMissed,
  onClearMissed,
}) {
  const [showSkipPicker, setShowSkipPicker] = useState(false);

  if (!workout) return null;

  const focusColors = {
    'Rest Day': 'bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/20',
    'Upper Body': 'bg-gradient-to-br from-orange-500/10 to-yellow-500/10 border border-orange-500/20',
    'Lower Body': 'bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-500/20',
  };

  const colorClass = isWorkoutMissed
    ? 'bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-500/25'
    : (focusColors[workout.focus] || focusColors['Upper Body']);

  const handleSkip = async (reason) => {
    const ok = await onMarkMissed?.(reason);
    if (ok !== false) setShowSkipPicker(false);
  };

  return (
    <div className="mt-6 mb-6">
      <div className={`rounded-2xl p-5 ${colorClass}`}>
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              {currentDay}
            </span>
            <h3 className="text-2xl font-bold mt-1">{workout.focus}</h3>
            {workout.exercises?.length > 0 && (
              <p className="text-sm text-zinc-400 mt-1">
                {workout.exercises.length} exercises
              </p>
            )}
            {isWorkoutMissed && (
              <p className="text-sm text-amber-300/90 mt-2 font-medium">
                Skipped{missedReason ? ` · ${missedReason}` : ''} — no guilt. We adapt.
              </p>
            )}
          </div>
          {workout.focus !== 'Rest Day' && !isWorkoutMissed && (
            <div className="relative w-16 h-16">
              <svg className="w-16 h-16 transform -rotate-90">
                <circle
                  cx="32"
                  cy="32"
                  r="28"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                  className="text-zinc-800"
                />
                <circle
                  cx="32"
                  cy="32"
                  r="28"
                  stroke="url(#gradient)"
                  strokeWidth="4"
                  fill="none"
                  strokeDasharray={`${completionPercentage * 1.76} 176`}
                  strokeLinecap="round"
                />
                <defs>
                  <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#f97316" />
                    <stop offset="100%" stopColor="#ef4444" />
                  </linearGradient>
                </defs>
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-sm font-bold">
                {completionPercentage}%
              </span>
            </div>
          )}
        </div>

        {workout.focus !== 'Rest Day' && (
          <div className="mt-4 space-y-2">
            {isWorkoutMissed ? (
              <button
                type="button"
                onClick={() => onClearMissed?.()}
                className="w-full py-3 px-4 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 bg-amber-500/15 border border-amber-500/30 text-amber-300 hover:bg-amber-500/25"
              >
                <Undo2 className="w-5 h-5" />
                Undo skip
              </button>
            ) : (
              <>
                {/* Complete: show when any progress, or always allow mark complete for empty days via skip path */}
                {completionPercentage > 0 && (
                  <button
                    type="button"
                    onClick={onToggleComplete}
                    className={`w-full py-3 px-4 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 ${
                      isWorkoutComplete
                        ? 'bg-green-500/20 border border-green-500/30 text-green-400 hover:bg-green-500/30'
                        : 'bg-orange-500/20 border border-orange-500/30 text-orange-400 hover:bg-orange-500/30'
                    }`}
                  >
                    {isWorkoutComplete ? (
                      <>
                        <RotateCcw className="w-5 h-5" />
                        Workout Complete - Tap to Edit
                      </>
                    ) : (
                      <>
                        <Check className="w-5 h-5" />
                        Complete Workout
                      </>
                    )}
                  </button>
                )}

                {!isWorkoutComplete && (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowSkipPicker((v) => !v)}
                      className="w-full py-3 px-4 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 bg-zinc-800/80 border border-zinc-700/60 text-zinc-300 hover:bg-zinc-800 hover:text-amber-200"
                    >
                      <CalendarOff className="w-5 h-5" />
                      {showSkipPicker ? 'Cancel skip' : 'Skip this day'}
                    </button>

                    {showSkipPicker && (
                      <div className="rounded-xl border border-zinc-700/50 bg-zinc-950/50 p-3">
                        <p className="text-xs text-zinc-500 mb-2 text-center">
                          Why skip? Optional — helps your next program.
                        </p>
                        <div className="flex flex-wrap gap-2 justify-center">
                          {SKIP_REASONS.map((r) => (
                            <button
                              key={r.id}
                              type="button"
                              onClick={() => handleSkip(r.id)}
                              className="px-3 py-1.5 rounded-full text-sm font-medium bg-zinc-800 text-zinc-200 border border-zinc-700 hover:border-amber-500/40 hover:text-amber-200 transition-colors"
                            >
                              {r.label}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => handleSkip(null)}
                            className="px-3 py-1.5 rounded-full text-sm font-medium bg-amber-500/15 text-amber-200 border border-amber-500/30 hover:bg-amber-500/25 transition-colors"
                          >
                            Just skip
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
