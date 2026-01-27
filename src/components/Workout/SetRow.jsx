import { Check } from 'lucide-react';

/**
 * Individual set row with toggle and weight display
 */
export default function SetRow({
  setIndex,
  percentage,
  weight,
  reps,
  isLogged,
  isViewingBuddy,
  isWorkoutComplete,
  exerciseName,
  onLogSet,
  onAddMax,
}) {
  // Disable interaction when viewing buddy or when workout is marked complete
  const isDisabled = isViewingBuddy || isWorkoutComplete;
  return (
    <div
      onClick={!isDisabled ? onLogSet : undefined}
      className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
        isLogged
          ? 'bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/30'
          : 'bg-zinc-800/40 hover:bg-zinc-800/60'
      } ${!isDisabled ? 'cursor-pointer' : ''} ${isWorkoutComplete ? 'opacity-75' : ''}`}
    >
      {isDisabled ? (
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center ${
            isLogged ? 'bg-green-500 text-white' : 'bg-zinc-700'
          }`}
        >
          {isLogged ? (
            <Check className="w-5 h-5" />
          ) : (
            <span className="text-sm font-bold">{setIndex + 1}</span>
          )}
        </div>
      ) : (
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
            isLogged
              ? 'bg-green-500 text-white'
              : 'bg-zinc-700 hover:bg-zinc-600'
          }`}
        >
          {isLogged ? (
            <Check className="w-5 h-5" />
          ) : (
            <span className="text-sm font-bold">{setIndex + 1}</span>
          )}
        </div>
      )}

      <div className="flex-1">
        <div className="flex items-baseline gap-2">
          {weight ? (
            <>
              <span className="text-lg font-bold">{weight} lbs</span>
              <span className="text-xs text-zinc-400">@ {percentage}% 1RM</span>
            </>
          ) : percentage ? (
            // Has percentage but no 1RM logged - prompt user to add
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (!isDisabled && onAddMax) onAddMax();
              }}
              className={`flex items-baseline gap-2 ${
                !isDisabled ? 'hover:text-orange-400 transition-colors' : ''
              }`}
              disabled={isDisabled}
            >
              <span className="text-zinc-400">{percentage}% of 1RM</span>
              {!isDisabled && (
                <span className="text-xs text-orange-500 font-medium">+ Add Max</span>
              )}
            </button>
          ) : (
            <span className="text-zinc-400">Bodyweight / As prescribed</span>
          )}
        </div>
      </div>
      <span className="text-sm text-zinc-400 font-medium">{reps}</span>
    </div>
  );
}
