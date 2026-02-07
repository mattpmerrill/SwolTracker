import { View, Text, Pressable } from 'react-native';
import { Check, RotateCcw } from 'lucide-react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

interface WorkoutFocusProps {
  focus: string;
  exerciseCount: number;
  completionPercentage: number;
  isWorkoutComplete: boolean;
  onToggleComplete: () => void;
}

export function WorkoutFocus({
  focus,
  exerciseCount,
  completionPercentage,
  isWorkoutComplete,
  onToggleComplete,
}: WorkoutFocusProps) {
  if (focus === 'Rest Day') return null;

  const radius = 28;
  const strokeWidth = 5;
  const circumference = 2 * Math.PI * radius;
  const progress = (completionPercentage / 100) * circumference;

  return (
    <View className="mx-4 bg-zinc-900 rounded-2xl p-4 border border-zinc-800/50">
      <View className="flex-row items-center justify-between">
        <View className="flex-1">
          <Text className="text-zinc-50 text-xl font-bold">{focus}</Text>
          <Text className="text-zinc-500 text-sm mt-0.5">
            {exerciseCount} exercise{exerciseCount !== 1 ? 's' : ''}
          </Text>
        </View>

        {/* Completion Ring */}
        <View className="items-center justify-center">
          <Svg width={70} height={70}>
            <Defs>
              <LinearGradient id="progressGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <Stop offset="0%" stopColor="#f97316" />
                <Stop offset="100%" stopColor="#ef4444" />
              </LinearGradient>
            </Defs>
            <Circle
              cx={35}
              cy={35}
              r={radius}
              stroke="#27272a"
              strokeWidth={strokeWidth}
              fill="transparent"
            />
            <Circle
              cx={35}
              cy={35}
              r={radius}
              stroke="url(#progressGrad)"
              strokeWidth={strokeWidth}
              fill="transparent"
              strokeDasharray={`${progress} ${circumference}`}
              strokeDashoffset={0}
              strokeLinecap="round"
              transform={`rotate(-90 35 35)`}
            />
          </Svg>
          <Text className="text-zinc-50 text-sm font-bold absolute">
            {completionPercentage}%
          </Text>
        </View>
      </View>

      {/* Complete Workout Button */}
      {completionPercentage > 0 && (
        <Pressable
          onPress={onToggleComplete}
          className={`mt-3 flex-row items-center justify-center py-3 rounded-xl ${
            isWorkoutComplete ? 'bg-green-500/20' : 'bg-orange-500'
          }`}
        >
          {isWorkoutComplete ? (
            <>
              <RotateCcw size={16} color="#4ade80" />
              <Text className="text-green-400 font-semibold ml-2">
                Workout Complete
              </Text>
            </>
          ) : (
            <>
              <Check size={16} color="white" />
              <Text className="text-white font-semibold ml-2">
                Complete Workout
              </Text>
            </>
          )}
        </Pressable>
      )}
    </View>
  );
}
