import { View, Text, ScrollView } from 'react-native';
import { TrendingUp, Plus } from 'lucide-react-native';

const LIFTS = [
  { name: 'Deadlift',       weight: 365, change: '+15' },
  { name: 'Back Squat',     weight: 315, change: '+10' },
  { name: 'Bench Press',    weight: 245, change: '+10' },
  { name: 'Power Clean',    weight: 205, change: '+5'  },
  { name: 'Overhead Press', weight: 155, change: '+5'  },
  { name: 'Barbell Row',    weight: 185, change: '+10' },
  { name: 'Front Squat',    weight: 255, change: '+10' },
];

function LiftCard({ name, weight, change }: { name: string; weight: number; change: string }) {
  return (
    <View className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800/50 mr-3 w-44">
      <View className="flex-row items-center justify-between mb-2">
        <View className="bg-orange-500/10 border border-orange-500/20 px-2 py-0.5 rounded-lg">
          <Text className="text-orange-400 text-xs font-semibold">1RM</Text>
        </View>
        <View className="flex-row items-center">
          <TrendingUp size={12} color="#4ade80" />
          <Text className="text-green-400 text-xs font-semibold ml-0.5">{change}</Text>
        </View>
      </View>
      <Text className="text-zinc-50 text-3xl font-bold">{weight}</Text>
      <Text className="text-zinc-400 text-xs mt-0.5">lbs</Text>
      <Text className="text-zinc-300 text-sm font-semibold mt-2" numberOfLines={1}>{name}</Text>
    </View>
  );
}

export default function MaxesScreenshot() {
  return (
    <View className="flex-1 bg-zinc-950">
      <View className="pt-14 px-4 pb-4 flex-row items-center justify-between">
        <View>
          <Text className="text-zinc-50 text-2xl font-bold">Maxes</Text>
          <Text className="text-zinc-500 text-sm">Your 1-rep max library</Text>
        </View>
        <View className="bg-orange-500 w-10 h-10 rounded-2xl items-center justify-center">
          <Plus size={20} color="white" />
        </View>
      </View>

      {/* Swipeable cards row */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8 }}
        className="mb-4"
      >
        {LIFTS.map((l) => <LiftCard key={l.name} {...l} />)}
      </ScrollView>

      {/* Quick reference list */}
      <View className="mx-4 bg-zinc-900 rounded-2xl border border-zinc-800/50 overflow-hidden flex-1 mb-6">
        <View className="flex-row items-center justify-between px-4 py-3 border-b border-zinc-800">
          <Text className="text-zinc-50 text-base font-bold">Quick Reference</Text>
          <Text className="text-zinc-500 text-sm">sorted by weight</Text>
        </View>
        <ScrollView>
          {LIFTS.sort((a, b) => b.weight - a.weight).map((l, i) => (
            <View
              key={l.name}
              className={`flex-row items-center px-4 py-3 ${
                i < LIFTS.length - 1 ? 'border-b border-zinc-800/50' : ''
              }`}
            >
              <Text className="text-zinc-600 text-sm w-6">{i + 1}</Text>
              <Text className="text-zinc-200 text-sm flex-1 font-medium">{l.name}</Text>
              <Text className="text-zinc-50 text-sm font-bold">{l.weight} lbs</Text>
            </View>
          ))}
        </ScrollView>
      </View>

      <View className="bg-zinc-900 border-t border-zinc-800 px-6 py-5 items-center">
        <Text className="text-zinc-50 text-lg font-bold">Every PR, in one place.</Text>
        <Text className="text-zinc-400 text-sm mt-0.5">Weights auto-calculate across all your programs.</Text>
      </View>
    </View>
  );
}
