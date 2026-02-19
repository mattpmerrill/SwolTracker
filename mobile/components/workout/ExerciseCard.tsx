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
  isSetLogged,
  onLogSet,
  onAddMax,
  onSetCompleted,
  disabled = false,
}: ExerciseCardProps) {
  const hasMax = !!findMaxKey(exercise.name, userMaxes);

  return (
    <View className="mx-4 bg-zinc-900 rounded-2xl p-4 border border-zinc-800/50">
      {/* Header */}
      <View className="flex-row items-start justify-between mb-3">
        <View className="flex-1 mr-3">
          <Text className="text-zinc-50 text-base font-bold">{exercise.name}</Text>
          {exercise.muscleGroups && (
            <Text className="text-zinc-500 text-xs mt-0.5">{exercise.muscleGroups}</Text>
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
