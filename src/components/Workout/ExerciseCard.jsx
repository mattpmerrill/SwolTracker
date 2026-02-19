import { RefreshCw, Loader2, Check, X } from 'lucide-react';
import SetRow from './SetRow';
import { calculateWeight } from '../../utils/workout';

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

  return (
    <div className="bg-zinc-900/50 rounded-2xl border border-zinc-800/50 overflow-hidden">
      <div className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <h4 className="font-bold text-lg leading-tight">{exercise.name}</h4>
            <p className="text-sm text-zinc-400 mt-1">{exercise.muscleGroups}</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Swap button */}
            {!hasAlternative && (
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
            <div className="bg-zinc-800/80 px-3 py-1.5 rounded-lg">
              <span className="text-sm font-semibold">
                {exercise.sets}×{exercise.reps}
              </span>
            </div>
          </div>
        </div>

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
              : null;
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
                onLogSet={() => onLogSet(exerciseIndex, setIdx, { weight, reps: exercise.reps })}
                onAddMax={() => onAddMax(exercise.name)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
