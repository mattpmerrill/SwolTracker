import { View, Text, Pressable } from 'react-native';
import { Check, Plus } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

interface SetRowProps {
  setIndex: number;
  percentage?: number;
  weight: number | null;
  reps: number | string;
  isLogged: boolean;
  hasMax: boolean;
  exerciseName: string;
  onPress: () => void;
  onAddMax: () => void;
  disabled?: boolean;
}

export function SetRow({
  setIndex,
  percentage,
  weight,
  reps,
  isLogged,
  hasMax,
  exerciseName,
  onPress,
  onAddMax,
  disabled = false,
}: SetRowProps) {
  const handlePress = async () => {
    if (disabled) return;
    await Haptics.impactAsync(
      isLogged
        ? Haptics.ImpactFeedbackStyle.Light
        : Haptics.ImpactFeedbackStyle.Medium
    );
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      className={`flex-row items-center py-3 px-3 rounded-xl ${
        isLogged ? 'bg-green-500/15' : 'bg-zinc-800/60'
      } ${disabled ? 'opacity-50' : ''}`}
    >
      {/* Set number / check */}
      <View
        className={`w-8 h-8 rounded-lg items-center justify-center mr-3 ${
          isLogged ? 'bg-green-500/30' : 'bg-zinc-700/50'
        }`}
      >
        {isLogged ? (
          <Check size={16} color="#4ade80" />
        ) : (
          <Text className="text-zinc-400 text-sm font-bold">{setIndex + 1}</Text>
        )}
      </View>

      {/* Weight info */}
      <View className="flex-1">
        {percentage && weight ? (
          <Text className="text-zinc-100 text-sm font-medium">
            {weight} lbs
            <Text className="text-zinc-500"> @ {percentage}% 1RM</Text>
          </Text>
        ) : percentage && !hasMax ? (
          <View className="flex-row items-center">
            <Text className="text-zinc-400 text-sm">{percentage}% of 1RM</Text>
            <Pressable
              onPress={onAddMax}
              className="flex-row items-center ml-2 bg-orange-500/20 px-2 py-0.5 rounded-md"
            >
              <Plus size={12} color="#f97316" />
              <Text className="text-orange-400 text-xs font-semibold ml-0.5">Add Max</Text>
            </Pressable>
          </View>
        ) : (
          <Text className="text-zinc-400 text-sm">
            {typeof reps === 'string' ? reps : `${reps} reps`}
          </Text>
        )}
      </View>

      {/* Reps */}
      <Text className="text-zinc-500 text-sm">
        {typeof reps === 'number' ? `${reps} reps` : reps}
      </Text>
    </Pressable>
  );
}
