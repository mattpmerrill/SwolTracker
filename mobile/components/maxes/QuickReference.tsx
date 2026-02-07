import { View, Text, ScrollView } from 'react-native';

interface QuickReferenceProps {
  exerciseName: string;
  maxWeight: number;
}

const PERCENTAGES = [95, 90, 85, 80, 75, 70, 65, 60, 55, 50];

export function QuickReference({ exerciseName, maxWeight }: QuickReferenceProps) {
  return (
    <View className="bg-zinc-900 rounded-2xl p-4 mx-4 border border-zinc-800/50">
      <Text className="text-zinc-50 text-base font-bold mb-3">
        {exerciseName} — Quick Reference
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {PERCENTAGES.map((pct) => {
          const weight = Math.round((maxWeight * pct) / 100 / 5) * 5;
          return (
            <View key={pct} className="bg-zinc-800 rounded-lg px-3 py-2 items-center min-w-[70px]">
              <Text className="text-zinc-500 text-xs">{pct}%</Text>
              <Text className="text-zinc-100 text-sm font-bold">{weight}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
