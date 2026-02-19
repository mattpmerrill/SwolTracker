import { View, Text, ScrollView } from 'react-native';
import { Users, Trophy, TrendingUp, Check } from 'lucide-react-native';

const CREW_MEMBERS = [
  { name: 'Jordan K.',   avatar: '🦁', role: 'leader', sets: 312, pr: 'Deadlift 405 lbs' },
  { name: 'Alex R.',     avatar: '🔥', role: 'member', sets: 287, pr: 'Squat 335 lbs'    },
  { name: 'Sam T.',      avatar: '⚡', role: 'member', sets: 256, pr: 'Bench 275 lbs'    },
  { name: 'Morgan P.',   avatar: '💪', role: 'member', sets: 241, pr: 'OHP 175 lbs'      },
];

const RECENT = [
  { user: 'Jordan K.', avatar: '🦁', action: 'completed Week 3 · Lower Body', time: '2h ago' },
  { user: 'Alex R.',   avatar: '🔥', action: 'hit a new PR — Squat 335 lbs 🎉',  time: '5h ago' },
  { user: 'Sam T.',    avatar: '⚡', action: 'completed Week 3 · Upper Body',   time: '1d ago' },
];

export default function CrewScreenshot() {
  return (
    <View className="flex-1 bg-zinc-950">
      <View className="pt-14 px-4 pb-4 flex-row items-center">
        <Users size={24} color="#f97316" />
        <Text className="text-zinc-50 text-2xl font-bold ml-2">Iron Crew</Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
      >
        {/* Crew stats */}
        <View className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800/50 mb-3">
          <Text className="text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-3">
            This Week
          </Text>
          <View className="flex-row justify-between">
            {[
              { label: 'Workouts', value: '18' },
              { label: 'Total Sets', value: '412' },
              { label: 'PRs Hit',    value: '3' },
            ].map((s) => (
              <View key={s.label} className="items-center flex-1">
                <Text className="text-zinc-50 text-2xl font-bold">{s.value}</Text>
                <Text className="text-zinc-500 text-xs mt-0.5">{s.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Leaderboard */}
        <View className="bg-zinc-900 rounded-2xl border border-zinc-800/50 overflow-hidden mb-3">
          <View className="flex-row items-center px-4 py-3 border-b border-zinc-800">
            <Trophy size={16} color="#f97316" />
            <Text className="text-zinc-50 text-base font-bold ml-2">Leaderboard</Text>
          </View>
          {CREW_MEMBERS.map((m, i) => (
            <View
              key={m.name}
              className={`flex-row items-center px-4 py-3 ${
                i < CREW_MEMBERS.length - 1 ? 'border-b border-zinc-800/50' : ''
              }`}
            >
              <Text className="text-zinc-600 text-sm w-5">{i + 1}</Text>
              <Text className="text-2xl mr-2">{m.avatar}</Text>
              <View className="flex-1">
                <View className="flex-row items-center">
                  <Text className="text-zinc-100 text-sm font-semibold">{m.name}</Text>
                  {m.role === 'leader' && (
                    <View className="ml-2 bg-orange-500/10 border border-orange-500/30 px-1.5 py-0.5 rounded-md">
                      <Text className="text-orange-400 text-xs">Leader</Text>
                    </View>
                  )}
                </View>
                <Text className="text-zinc-500 text-xs mt-0.5">{m.pr}</Text>
              </View>
              <View className="items-end">
                <Text className="text-zinc-100 text-sm font-bold">{m.sets}</Text>
                <Text className="text-zinc-600 text-xs">sets</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Activity feed */}
        <View className="bg-zinc-900 rounded-2xl border border-zinc-800/50 overflow-hidden">
          <View className="flex-row items-center px-4 py-3 border-b border-zinc-800">
            <TrendingUp size={16} color="#3b82f6" />
            <Text className="text-zinc-50 text-base font-bold ml-2">Activity</Text>
          </View>
          {RECENT.map((r, i) => (
            <View
              key={i}
              className={`flex-row items-start px-4 py-3 ${
                i < RECENT.length - 1 ? 'border-b border-zinc-800/50' : ''
              }`}
            >
              <Text className="text-xl mr-3">{r.avatar}</Text>
              <View className="flex-1">
                <Text className="text-zinc-200 text-sm">
                  <Text className="font-semibold">{r.user}</Text>
                  <Text className="text-zinc-400"> {r.action}</Text>
                </Text>
                <Text className="text-zinc-600 text-xs mt-0.5">{r.time}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      <View className="bg-zinc-900 border-t border-zinc-800 px-6 py-5 items-center">
        <Text className="text-zinc-50 text-lg font-bold">Train together. Get stronger together.</Text>
        <Text className="text-zinc-400 text-sm mt-0.5">Share programs, track each other's PRs.</Text>
      </View>
    </View>
  );
}
