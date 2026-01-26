import SetRow from './SetRow';
import { calculateWeight } from '../../utils/workout';

/**
 * Exercise card with name, muscle groups, and sets
 */
export default function ExerciseCard({
  exercise,
  exerciseIndex,
  userMaxes,
  isViewingBuddy,
  isSetLogged,
  onLogSet,
  onAddMax,
}) {
  return (
    <div className="bg-zinc-900/50 rounded-2xl border border-zinc-800/50 overflow-hidden">
      <div className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <h4 className="font-bold text-lg leading-tight">{exercise.name}</h4>
            <p className="text-sm text-zinc-400 mt-1">{exercise.muscleGroups}</p>
          </div>
          <div className="flex items-center gap-2 bg-zinc-800/80 px-3 py-1.5 rounded-lg">
            <span className="text-sm font-semibold">
              {exercise.sets}×{exercise.reps}
            </span>
          </div>
        </div>

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
                isViewingBuddy={isViewingBuddy}
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
