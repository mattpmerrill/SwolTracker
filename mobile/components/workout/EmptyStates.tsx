import { View, Text, Pressable } from 'react-native';
import { Brain, Clock, ChevronLeft } from 'lucide-react-native';

interface NoWorkoutStateProps {
  currentWeek: number;
  onGenerateWorkout: () => void;
  onBackToCurrentWeek: () => void;
}

export function NoWorkoutState({
  currentWeek,
  onGenerateWorkout,
  onBackToCurrentWeek,
}: NoWorkoutStateProps) {
  return (
    <View className="flex-1 items-center justify-center px-8">
      <View className="w-16 h-16 bg-zinc-800 rounded-2xl items-center justify-center mb-4">
        <Brain size={32} color="#f97316" />
      </View>
      <Text className="text-zinc-50 text-xl font-bold text-center">
        Week {currentWeek} is uncharted territory!
      </Text>
      <Text className="text-zinc-400 text-sm text-center mt-2 mb-6">
        Use AI Coach to generate a personalized workout program for this week.
      </Text>

      <Pressable
        onPress={onGenerateWorkout}
        className="bg-orange-500 flex-row items-center px-6 py-3.5 rounded-xl mb-3"
      >
        <Brain size={18} color="white" />
        <Text className="text-white font-semibold ml-2">
          Generate Week {currentWeek} with AI
        </Text>
      </Pressable>

      <Pressable
        onPress={onBackToCurrentWeek}
        className="flex-row items-center px-4 py-2"
      >
        <ChevronLeft size={16} color="#71717a" />
        <Text className="text-zinc-500 text-sm ml-1">Back to Current Week</Text>
      </Pressable>
    </View>
  );
}

export function RestDayState() {
  return (
    <View className="flex-1 items-center justify-center px-8">
      <View className="w-16 h-16 bg-blue-500/20 rounded-2xl items-center justify-center mb-4">
        <Clock size={32} color="#60a5fa" />
      </View>
      <Text className="text-zinc-50 text-xl font-bold text-center">Recovery Day</Text>
      <Text className="text-zinc-400 text-sm text-center mt-2">
        Rest, stretch, and prepare for tomorrow's training.
      </Text>
    </View>
  );
}
