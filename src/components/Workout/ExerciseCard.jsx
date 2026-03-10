import { useState } from 'react';
import { RefreshCw, Loader2, Check, X } from 'lucide-react';
import SetRow from './SetRow';
import RestTimer from './RestTimer';
import { calculateWeight, findMaxKey } from '../../utils/workout';

/**
 * Exercise card with name, muscle groups, and sets
 * Includes swap functionality for finding alternative exercises
 */
export default function ExerciseCard({
  exercise,
  exerciseIndex,
  userMaxes,
  isWorkoutComplete,
  isSetLogged,
  onLogSet,
  onAddMax,
  swapState,
  onRequestSwap,
  onAcceptSwap,
  onCancelSwap,
}) {
  const isSwapping = swapState?.loading && swapState?.exerciseIndex === exerciseIndex;
  const hasAlternative = swapState?.exerciseIndex === exerciseIndex && swapState?.alternative;

  // Rest timer state
  const [restTimer, setRestTimer] = useState(null); // { setIndex }

  // Recommended rest based on reps (heavy = longer rest)
  function getRestSeconds(reps) {
    const r = parseInt(reps, 10);
    if (isNaN(r) || r <= 3) return 180; // heavy triples → 3 min
    if (r <= 6) return 150;             // strength work → 2.5 min
    if (r <= 10) return 90;             // hypertrophy → 90s
    return 60;                          // high rep / conditioning → 60s
  }

  function handleLogSet(setIdx, data) {
    onLogSet(exerciseIndex, setIdx, data);
    // Only show timer if this set wasn't already logged (i.e. we're logging it, not unlogging)
    const alreadyLogged = isSetLogged(exerciseIndex, setIdx);
    if (!alreadyLogged && !isWorkoutComplete) {
      setRestTimer({ setIndex: setIdx });
    }
  }

  // Count how many sets are logged for this exercise
  const loggedCount = Array.from({ length: exercise.sets }).filter((_, si) =>
    isSetLogged(exerciseIndex, si)
  ).length;
  const totalSets = exercise.sets;
  const allDone = loggedCount === totalSets;
  const inProgress = loggedCount > 0 && !allDone;
  const pct = totalSets > 0 ? Math.round((loggedCount / totalSets) * 100) : 0;

  return (
    <div className={`bg-zinc-900/50 rounded-2xl border overflow-hidden transition-colors ${
      allDone ? 'border-green-500/30' : 'border-zinc-800/50'
    }`}>
      <div className="p-5">
        <div className="flex items-start justify-between mb-1">
          <div className="flex-1">
            <h4 className="font-bold text-lg leading-tight">{exercise.name}</h4>
            <p className="text-sm text-zinc-400 mt-1">{exercise.muscleGroups}</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Swap button */}
            {!hasAlternative && !isWorkoutComplete && (
              <button
                onClick={() => onRequestSwap?.(exercise, exerciseIndex)}
                disabled={isSwapping}
                className="p-1.5 rounded-lg hover:bg-zinc-800/80 transition-colors disabled:opacity-50"
                title="Find alternative exercise"
              >
                {isSwapping ? (
                  <Loader2 className="w-4 h-4 text-zinc-400 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 text-zinc-500 hover:text-orange-500" />
                )}
              </button>
            )}
            <div className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 ${
              allDone ? 'bg-green-500/20' : 'bg-zinc-800/80'
            }`}>
              {allDone && <Check className="w-3.5 h-3.5 text-green-400" />}
              <span className={`text-sm font-semibold ${allDone ? 'text-green-400' : ''}`}>
                {exercise.sets}×{exercise.reps}
              </span>
            </div>
          </div>
        </div>

        {/* Set progress indicator */}
        {(inProgress || allDone) && (
          <div className="mb-4 mt-2">
            <div className="flex items-center justify-between mb-1">
              <span className={`text-xs font-medium ${allDone ? 'text-green-400' : 'text-orange-400'}`}>
                {allDone ? '✓ All sets done' : `${loggedCount}/${totalSets} sets logged`}
              </span>
              <span className="text-xs text-zinc-500">{pct}%</span>
            </div>
            <div className="h-1 rounded-full bg-zinc-800 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  allDone ? 'bg-green-400' : 'bg-gradient-to-r from-orange-500 to-red-500'
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}

        {/* Spacer when no progress bar shown */}
        {!inProgress && !allDone && <div className="mb-4" />}

        {/* Alternative exercise suggestion */}
        {hasAlternative && (
          <div className="mb-4 px-3 py-3 bg-orange-500/10 border border-orange-500/30 rounded-xl">
            <p className="text-sm text-orange-400 font-medium mb-2">
              Swap with: {swapState.alternative.name}
            </p>
            <p className="text-xs text-zinc-400 mb-3">
              {swapState.alternative.muscleGroups}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => onAcceptSwap?.(exerciseIndex, swapState.alternative)}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <Check className="w-4 h-4" />
                Accept
              </button>
              <button
                onClick={() => onCancelSwap?.()}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
            </div>
          </div>
        )}

        {exercise.note && (
          <div className="mb-4 px-3 py-2 bg-zinc-800/40 rounded-lg">
            <p className="text-xs text-zinc-400">{exercise.note}</p>
          </div>
        )}

        <div className="space-y-2">
          {Array.from({ length: exercise.sets }).map((_, setIdx) => {
            const percentage = exercise.percentages?.[setIdx];
            const weight = percentage
              ? calculateWeight(percentage, userMaxes || {}, exercise.name)
              : (() => {
                  const key = findMaxKey(exercise.name, userMaxes || {});
                  return key ? (userMaxes[key] ?? null) : (userMaxes?.[exercise.name] ?? null);
                })();
            const logged = isSetLogged(exerciseIndex, setIdx);

            return (
              <SetRow
                key={setIdx}
                setIndex={setIdx}
                percentage={percentage}
                weight={weight}
                reps={exercise.reps}
                isLogged={logged}
                isWorkoutComplete={isWorkoutComplete}
                exerciseName={exercise.name}
                onLogSet={() => handleLogSet(setIdx, { weight, reps: exercise.reps })}
                onAddMax={() => onAddMax(exercise.name)}
              />
            );
          })}
        </div>
      </div>

      {/* Rest timer — shown after a set is logged */}
      {restTimer && (
        <RestTimer
          exerciseName={exercise.name}
          setIndex={restTimer.setIndex}
          totalSets={exercise.sets}
          restSeconds={getRestSeconds(exercise.reps)}
          onDismiss={() => setRestTimer(null)}
        />
      )}
    </div>
  );
}
