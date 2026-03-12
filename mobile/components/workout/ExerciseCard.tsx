import { View, Text } from 'react-native';
import { SetRow } from './SetRow';
import { calculateWeight, findMaxKey } from '../../../src/utils/workout';

interface Exercise {
  name: string;
  muscleGroups?: string;
  sets: number;
  reps: number | string;
  percentages?: number[];
  note?: string;
}

interface ExerciseCardProps {
  exercise: Exercise;
  exerciseIndex: number;
  userMaxes: Record<string, number>;
  overloadRecommendation?: {
    type: 'increase' | 'deload' | 'stale';
    status_label?: string;
    message?: string;
  } | null;
  isSetLogged: (exerciseIndex: number, setIndex: number) => boolean;
  onLogSet: (exerciseIndex: number, setIndex: number, data: any) => void;
  onAddMax?: (exerciseName: string) => void;
  onSetCompleted?: () => void;
  disabled?: boolean;
}

export function ExerciseCard({
  exercise,
  exerciseIndex,
  userMaxes,
  overloadRecommendation,
  isSetLogged,
  onLogSet,
  onAddMax,
  onSetCompleted,
  disabled = false,
}: ExerciseCardProps) {
  const hasMax = !!findMaxKey(exercise.name, userMaxes);
  const recommendationTone = overloadRecommendation?.type === 'increase'
    ? 'bg-emerald-500/10 border-emerald-500/30'
    : overloadRecommendation?.type === 'deload'
    ? 'bg-amber-500/10 border-amber-500/30'
    : 'bg-zinc-800 border-zinc-700';
  const recommendationTextTone = overloadRecommendation?.type === 'increase'
    ? 'text-emerald-300'
    : overloadRecommendation?.type === 'deload'
    ? 'text-amber-300'
    : 'text-zinc-300';

  return (
    <View className="mx-4 bg-zinc-900 rounded-2xl p-4 border border-zinc-800/50">
      {/* Header */}
      <View className="flex-row items-start justify-between mb-3">
        <View className="flex-1 mr-3">
          <Text className="text-zinc-50 text-base font-bold">{exercise.name}</Text>
          {exercise.muscleGroups && (
            <Text className="text-zinc-500 text-xs mt-0.5">{exercise.muscleGroups}</Text>
          )}
          {overloadRecommendation && (
            <View className={`self-start mt-2 rounded-full border px-2.5 py-1 ${recommendationTone}`}>
              <Text className={`text-xs font-semibold ${recommendationTextTone}`}>
                {overloadRecommendation.status_label || overloadRecommendation.type}
              </Text>
            </View>
          )}
        </View>
        <View className="bg-zinc-800 px-2.5 py-1 rounded-lg">
          <Text className="text-zinc-300 text-xs font-semibold">
            {exercise.sets}×{exercise.reps}
          </Text>
        </View>
      </View>

      {/* Note */}
      {exercise.note && (
        <View className="bg-zinc-800/50 rounded-lg px-3 py-2 mb-3">
          <Text className="text-zinc-400 text-xs">{exercise.note}</Text>
        </View>
      )}

      {overloadRecommendation?.message && (
        <View className="bg-zinc-800/50 rounded-lg px-3 py-2 mb-3">
          <Text className="text-zinc-300 text-xs">{overloadRecommendation.message}</Text>
        </View>
      )}

      {/* Sets */}
      <View className="gap-2">
        {Array.from({ length: exercise.sets }).map((_, setIndex) => {
          const percentage = exercise.percentages?.[setIndex];
          const weight = percentage
            ? calculateWeight(percentage, userMaxes, exercise.name)
            : null;
          const logged = isSetLogged(exerciseIndex, setIndex);

          return (
            <SetRow
              key={setIndex}
              setIndex={setIndex}
              percentage={percentage}
              weight={weight}
              reps={exercise.reps}
              isLogged={logged}
              hasMax={hasMax}
              exerciseName={exercise.name}
              onPress={() =>
                onLogSet(exerciseIndex, setIndex, {
                  exerciseName: exercise.name,
                  weight,
                  reps: exercise.reps,
                  percentage,
                })
              }
              onAddMax={() => onAddMax?.(exercise.name)}
              onSetCompleted={onSetCompleted}
              disabled={disabled}
            />
          );
        })}
      </View>
    </View>
  );
}
