import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Loader2, Check, X } from 'lucide-react';
import SetRow from './SetRow';
import { calculateWeight, findMaxKey, resolveLoggedReps } from '../../utils/workout';
import { applyWeightCascade, overrideStorageKey } from '../../utils/weightOverrides';
import { getRestSeconds } from '../../utils/restCue';
import { getItem, setItem } from '../../utils/storage';

/**
 * Exercise card with name, muscle groups, and sets
 * Includes swap functionality for finding alternative exercises
 */
export default function ExerciseCard({
  exercise,
  exerciseIndex,
  currentWeek,
  currentDay,
  userMaxes,
  overloadRecommendation,
  isWorkoutComplete,
  isSetLogged,
  onLogSet,
  onAddMax,
  onRestStart,
  swapState,
  onRequestSwap,
  onAcceptSwap,
  onCancelSwap,
}) {
  const isSwapping = swapState?.loading && swapState?.exerciseIndex === exerciseIndex;
  const hasAlternative = swapState?.exerciseIndex === exerciseIndex && swapState?.alternative;

  const storageKey = overrideStorageKey('weightOverrides', currentWeek, currentDay, exercise.name);
  const repsStorageKey = overrideStorageKey('repsOverrides', currentWeek, currentDay, exercise.name);
  const [weightOverrides, setWeightOverrides] = useState(() => getItem(storageKey) || {});
  const [repsOverrides, setRepsOverrides] = useState(() => getItem(repsStorageKey) || {});

  useEffect(() => {
    setItem(storageKey, weightOverrides);
  }, [weightOverrides, storageKey]);

  useEffect(() => {
    setItem(repsStorageKey, repsOverrides);
  }, [repsOverrides, repsStorageKey]);

  function handleLogSet(setIdx, data) {
    onLogSet(exerciseIndex, setIdx, data);
    const alreadyLogged = isSetLogged(exerciseIndex, setIdx);
    if (!alreadyLogged && !isWorkoutComplete) {
      onRestStart?.({
        exerciseName: exercise.name,
        setIndex: setIdx,
        totalSets: exercise.sets,
        restSeconds: getRestSeconds(exercise.reps),
      });
    }
  }

  const handleWeightChange = useCallback((setIdx, newWeight) => {
    setWeightOverrides((prev) =>
      applyWeightCascade(
        prev,
        setIdx,
        newWeight,
        (i) => isSetLogged(exerciseIndex, i),
        exercise.sets,
      ),
    );
  }, [exerciseIndex, exercise.sets, isSetLogged]);

  const handleRepsChange = useCallback((setIdx, newReps) => {
    setRepsOverrides((prev) =>
      applyWeightCascade(
        prev,
        setIdx,
        newReps,
        (i) => isSetLogged(exerciseIndex, i),
        exercise.sets,
      ),
    );
  }, [exerciseIndex, exercise.sets, isSetLogged]);

  // Count how many sets are logged for this exercise
  const loggedCount = Array.from({ length: exercise.sets }).filter((_, si) =>
    isSetLogged(exerciseIndex, si)
  ).length;
  const totalSets = exercise.sets;
  const allDone = loggedCount === totalSets;
  const inProgress = loggedCount > 0 && !allDone;
  const pct = totalSets > 0 ? Math.round((loggedCount / totalSets) * 100) : 0;
  const recommendationTone = overloadRecommendation?.type === 'increase'
    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
    : overloadRecommendation?.type === 'deload'
    ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
    : 'bg-zinc-800/80 text-zinc-300 border-zinc-700/50';

  return (
    <div className={`bg-zinc-900/50 rounded-2xl border overflow-hidden transition-colors ${
      allDone ? 'border-green-500/30' : 'border-zinc-800/50'
    }`}>
      <div className="p-5">
        <div className="flex items-start justify-between mb-1">
          <div className="flex-1">
            <h4 className="font-bold text-lg leading-tight">{exercise.name}</h4>
            <p className="text-sm text-zinc-400 mt-1">{exercise.muscleGroups}</p>
            {overloadRecommendation && (
              <div className={`mt-3 inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${recommendationTone}`}>
                {overloadRecommendation.status_label || overloadRecommendation.type}
              </div>
            )}
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
            <div className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 max-w-[60vw] ${
              allDone ? 'bg-green-500/20' : 'bg-zinc-800/80'
            }`}>
              {allDone && <Check className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />}
              {(() => {
                // Defensive: same cap as SetRow so a polluted "reps" string cannot
                // blow out this header badge. Tooltip exposes the full text.
                const repsText = exercise.reps == null ? '' : String(exercise.reps);
                const REPS_VISIBLE_MAX = 16;
                const truncated = repsText.length > REPS_VISIBLE_MAX
                  ? `${repsText.slice(0, REPS_VISIBLE_MAX - 1)}…`
                  : repsText;
                return (
                  <span
                    className={`text-sm font-semibold truncate ${allDone ? 'text-green-400' : ''}`}
                    title={repsText.length > REPS_VISIBLE_MAX ? repsText : undefined}
                  >
                    {exercise.sets}×{truncated}
                  </span>
                );
              })()}
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
            <p
              className="text-xs text-zinc-400 break-words"
              style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
            >
              {exercise.note}
            </p>
          </div>
        )}

        {overloadRecommendation?.message && (
          <div className="mb-4 px-3 py-2 bg-zinc-800/40 rounded-lg">
            <p
              className="text-xs text-zinc-300 break-words"
              style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
            >
              {overloadRecommendation.message}
            </p>
          </div>
        )}

        <div className="space-y-2">
          {Array.from({ length: exercise.sets }).map((_, setIdx) => {
            const percentage = exercise.percentages?.[setIdx];
            const prescribedWeight = percentage
              ? calculateWeight(percentage, userMaxes || {}, exercise.name)
              : (() => {
                  const key = findMaxKey(exercise.name, userMaxes || {});
                  return key ? (userMaxes[key] ?? null) : (userMaxes?.[exercise.name] ?? null);
                })();
            const override = weightOverrides[setIdx] ?? null;
            const repsOverride = repsOverrides[setIdx] ?? null;
            const actualWeight = override ?? prescribedWeight;
            const logged = isSetLogged(exerciseIndex, setIdx);

            return (
              <SetRow
                key={setIdx}
                setIndex={setIdx}
                percentage={percentage}
                prescribedWeight={prescribedWeight}
                weightOverride={override}
                reps={exercise.reps}
                repsOverride={repsOverride}
                isLogged={logged}
                isWorkoutComplete={isWorkoutComplete}
                exerciseName={exercise.name}
                onLogSet={() => handleLogSet(setIdx, {
                  exerciseName: exercise.name,
                  actualWeight,
                  prescribedWeight,
                  actualReps: resolveLoggedReps(exercise.reps, repsOverride),
                  prescribedReps: exercise.reps,
                })}
                onAddMax={() => onAddMax(exercise.name)}
                onWeightChange={(newWeight) => handleWeightChange(setIdx, newWeight)}
                onRepsChange={(newReps) => handleRepsChange(setIdx, newReps)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
