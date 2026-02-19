import { View, Text, ScrollView } from 'react-native';
import { Check } from 'lucide-react-native';

const EXERCISE_DATA = [
  {
    name: 'Back Squat', muscle: 'Quads · Glutes', sets: 4, reps: 5,
    setData: [
      { weight: 275, pct: 75, done: true },
      { weight: 275, pct: 75, done: true },
      { weight: 295, pct: 80, done: true },
      { weight: 295, pct: 80, done: false },
    ],
  },
  {
    name: 'Romanian Deadlift', muscle: 'Hamstrings · Lower Back', sets: 3, reps: 8,
    setData: [
      { weight: 195, pct: 65, done: true },
      { weight: 195, pct: 65, done: false },
      { weight: 195, pct: 65, done: false },
    ],
  },
];

function SetRow({ set, index }: { set: any; index: number }) {
  return (
    <View className={`flex-row items-center py-3 px-3 rounded-xl mb-1.5 ${
      set.done ? 'bg-green-500/15' : 'bg-zinc-800/60'
    }`}>
      <View className={`w-8 h-8 rounded-lg items-center justify-center mr-3 ${
        set.done ? 'bg-green-500/30' : 'bg-zinc-700/50'
      }`}>
        {set.done
          ? <Check size={16} color="#4ade80" />
          : <Text className="text-zinc-400 text-sm font-bold">{index + 1}</Text>
        }
      </View>
      <View className="flex-1">
        <Text className="text-zinc-100 text-sm font-medium">
          {set.weight} lbs
          <Text className="text-zinc-500"> @ {set.pct}% 1RM</Text>
        </Text>
      </View>
      <Text className="text-zinc-500 text-sm">5 reps</Text>
    </View>
  );
}

export default function WorkoutScreenshot() {
  return (
    <View className="flex-1 bg-zinc-950">
      {/* Status area + header */}
      <View className="pt-14 px-4 pb-3">
        <View className="flex-row items-center justify-between mb-4">
          {['Wk 1','Wk 2','Wk 3','Wk 4'].map((w, i) => (
            <View key={w} className={`flex-1 mx-1 py-2 rounded-xl items-center ${
              i === 1 ? 'bg-orange-500' : 'bg-zinc-800'
            }`}>
              <Text className={`text-xs font-semibold ${i === 1 ? 'text-white' : 'text-zinc-500'}`}>
                {w}
              </Text>
            </View>
          ))}
        </View>
        <View className="flex-row justify-between mb-2">
          {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((d) => (
            <View key={d} className={`w-10 py-2 rounded-xl items-center ${
              d === 'Wed' ? 'bg-orange-500' : 'bg-zinc-900'
            }`}>
              <Text className={`text-xs font-semibold ${d === 'Wed' ? 'text-white' : 'text-zinc-500'}`}>
                {d}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
      >
        {/* Focus card */}
        <View className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800/50 mb-3">
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-orange-400 text-xs font-semibold uppercase tracking-wider">
                Lower Body · Week 2
              </Text>
              <Text className="text-zinc-50 text-xl font-bold mt-0.5">Strength Day</Text>
              <Text className="text-zinc-500 text-sm mt-0.5">6 exercises · 24 sets total</Text>
            </View>
          </View>
          <View className="h-2 bg-zinc-800 rounded-full mt-3 overflow-hidden">
            <View className="h-full bg-orange-500 rounded-full" style={{ width: '54%' }} />
          </View>
          <Text className="text-zinc-500 text-xs mt-1">54% complete</Text>
        </View>

        {/* Exercises */}
        {EXERCISE_DATA.map((ex) => (
          <View key={ex.name} className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800/50 mb-3">
            <View className="flex-row items-start justify-between mb-3">
              <View className="flex-1 mr-3">
                <Text className="text-zinc-50 text-base font-bold">{ex.name}</Text>
                <Text className="text-zinc-500 text-xs mt-0.5">{ex.muscle}</Text>
              </View>
              <View className="bg-zinc-800 px-2.5 py-1 rounded-lg">
                <Text className="text-zinc-300 text-xs font-semibold">{ex.sets}×{ex.reps}</Text>
              </View>
            </View>
            {ex.setData.map((s, i) => <SetRow key={i} set={s} index={i} />)}
          </View>
        ))}
      </ScrollView>

      {/* Caption bar */}
      <View className="bg-orange-500 px-6 py-5 items-center">
        <Text className="text-white text-lg font-bold">Log every rep. Track every PR.</Text>
        <Text className="text-orange-100 text-sm mt-0.5">Percentage-based programming, auto-calculated.</Text>
      </View>
    </View>
  );
}
