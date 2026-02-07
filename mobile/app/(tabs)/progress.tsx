import { View, Text, ScrollView } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useProfileStore } from '../../stores/profileStore';
import { useWorkoutStore } from '../../stores/workoutStore';
import { BarChart3, TrendingUp, Calendar, Flame } from 'lucide-react-native';
import { Card } from '../../components/ui';

function StatCard({ icon: Icon, label, value, color }: {
  icon: any; label: string; value: string | number; color: string;
}) {
  return (
    <View className="flex-1 bg-zinc-900 rounded-2xl p-4 border border-zinc-800/50">
      <Icon size={20} color={color} />
      <Text className="text-zinc-50 text-2xl font-bold mt-2">{value}</Text>
      <Text className="text-zinc-500 text-xs mt-0.5">{label}</Text>
    </View>
  );
}

export default function ProgressScreen() {
  const { user } = useAuth();
  const { maxes } = useProfileStore();
  const { exerciseLog, completedWorkouts } = useWorkoutStore();

  const totalMaxes = Object.keys(maxes).length;
  const totalSetsLogged = Object.values(exerciseLog).filter((l: any) => l?.completed).length;
  const totalWorkoutsCompleted = Object.values(completedWorkouts).filter(Boolean).length;

  // Calculate total weight lifted
  const totalWeightLifted = Object.values(exerciseLog).reduce((sum: number, log: any) => {
    if (log?.completed && log?.weight) return sum + (log.weight * (log.actual_reps || 1));
    return sum;
  }, 0);

  const sortedMaxes = Object.entries(maxes)
    .sort(([, a], [, b]) => (b as number) - (a as number));

  return (
    <ScrollView
      className="flex-1 bg-zinc-950"
      contentContainerStyle={{ padding: 16, gap: 16 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View>
        <Text className="text-zinc-50 text-2xl font-bold">Progress</Text>
        <Text className="text-zinc-500 text-sm">Your training stats at a glance</Text>
      </View>

      {/* Stats Grid */}
      <View className="flex-row gap-3">
        <StatCard icon={Flame} label="Sets Logged" value={totalSetsLogged} color="#f97316" />
        <StatCard icon={Calendar} label="Workouts" value={totalWorkoutsCompleted} color="#22c55e" />
      </View>
      <View className="flex-row gap-3">
        <StatCard icon={TrendingUp} label="Lifts Tracked" value={totalMaxes} color="#3b82f6" />
        <StatCard
          icon={BarChart3}
          label="Total Volume"
          value={totalWeightLifted > 1000 ? `${(totalWeightLifted / 1000).toFixed(1)}k` : totalWeightLifted}
          color="#a855f7"
        />
      </View>

      {/* Strength Levels */}
      {sortedMaxes.length > 0 && (
        <View className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800/50">
          <Text className="text-zinc-50 text-lg font-bold mb-3">Strength Levels</Text>
          <View className="gap-3">
            {sortedMaxes.map(([name, weight]) => {
              const maxWeight = sortedMaxes[0][1] as number;
              const pct = ((weight as number) / maxWeight) * 100;
              return (
                <View key={name}>
                  <View className="flex-row justify-between mb-1">
                    <Text className="text-zinc-300 text-sm">{name}</Text>
                    <Text className="text-zinc-400 text-sm font-semibold">{weight} lbs</Text>
                  </View>
                  <View className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <View
                      className="h-full bg-orange-500 rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* Empty state */}
      {totalSetsLogged === 0 && totalMaxes === 0 && (
        <View className="items-center py-12">
          <View className="w-16 h-16 bg-zinc-800 rounded-2xl items-center justify-center mb-4">
            <BarChart3 size={32} color="#f97316" />
          </View>
          <Text className="text-zinc-50 text-xl font-bold text-center">No progress yet</Text>
          <Text className="text-zinc-400 text-sm text-center mt-2">
            Start logging workouts to see your stats here.
          </Text>
        </View>
      )}

      <View className="h-4" />
    </ScrollView>
  );
}
