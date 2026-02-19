import { useEffect, useState, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { BarChart3, TrendingUp, Calendar, Flame, Lock, Sparkles } from 'lucide-react-native';
import { useRouter } from 'expo-router';

import { useAuth } from '../../contexts/AuthContext';
import { useProfileStore } from '../../stores/profileStore';
import { useWorkoutStore } from '../../stores/workoutStore';
import { useSubscriptionStore } from '../../stores/subscriptionStore';
import { db } from '../../lib/db';
import { VolumeBarChart } from '../../components/progress/VolumeBarChart';
import { StrengthLineChart } from '../../components/progress/StrengthLineChart';

// ── Stat card ─────────────────────────────────────────────────────────────────

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

// ── Lift selector chip ────────────────────────────────────────────────────────

function LiftChip({
  label, selected, onPress,
}: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className={`px-3 py-1.5 rounded-xl border mr-2 ${
        selected
          ? 'border-blue-500 bg-blue-500/10'
          : 'border-zinc-700 bg-zinc-800'
      }`}
    >
      <Text
        className="text-xs font-medium"
        style={{ color: selected ? '#60a5fa' : '#a1a1aa' }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ── Section card ──────────────────────────────────────────────────────────────

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800/50">
      <Text className="text-zinc-50 text-base font-bold mb-3">{title}</Text>
      {children}
    </View>
  );
}

// ── Pro gate banner ───────────────────────────────────────────────────────────

function ProGateBanner({ onUpgrade }: { onUpgrade: () => void }) {
  return (
    <View className="bg-zinc-900 rounded-2xl border border-orange-500/30 p-5 items-center">
      <View className="w-12 h-12 bg-orange-500/10 rounded-2xl items-center justify-center mb-3">
        <Lock size={22} color="#f97316" />
      </View>
      <Text className="text-zinc-50 text-base font-bold text-center mb-1">
        Pro Feature
      </Text>
      <Text className="text-zinc-500 text-sm text-center mb-4">
        Unlock full progress charts, volume trends, and strength history with Pro.
      </Text>
      <Pressable
        onPress={onUpgrade}
        className="flex-row items-center bg-orange-500 rounded-xl px-5 py-2.5"
      >
        <Sparkles size={16} color="white" style={{ marginRight: 6 }} />
        <Text className="text-white font-bold text-sm">Upgrade to Pro</Text>
      </Pressable>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function ProgressScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { maxes } = useProfileStore();
  const { exerciseLog, completedWorkouts } = useWorkoutStore();
  const { isPro, openPaywall } = useSubscriptionStore();

  const handleUpgrade = () => {
    openPaywall();
    router.push('/(modals)/paywall');
  };

  // Lift history state
  const sortedMaxes = useMemo(
    () => Object.entries(maxes).sort(([, a], [, b]) => (b as number) - (a as number)),
    [maxes]
  );
  const [selectedLift, setSelectedLift] = useState<string | null>(null);
  const [liftHistory, setLiftHistory] = useState<Array<{ date: string; weight: number }>>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Set default lift when maxes load
  useEffect(() => {
    if (!selectedLift && sortedMaxes.length > 0) {
      setSelectedLift(sortedMaxes[0][0]);
    }
  }, [sortedMaxes]);

  // Load history when selected lift changes
  useEffect(() => {
    if (!selectedLift || !user?.id) return;
    setHistoryLoading(true);
    db.getMaxHistory(user.id, selectedLift)
      .then((rows: any[]) => {
        const points = (rows || []).map((r: any) => ({
          date: r.recorded_at || r.created_at,
          weight: r.weight_lbs ?? r.weight,
        }));
        setLiftHistory(points);
      })
      .catch(() => setLiftHistory([]))
      .finally(() => setHistoryLoading(false));
  }, [selectedLift, user?.id]);

  // ── Stats ────────────────────────────────────────────────────────────────

  const totalMaxes = sortedMaxes.length;
  const totalSetsLogged = Object.values(exerciseLog).filter((l: any) => l?.completed).length;
  const totalWorkoutsCompleted = Object.values(completedWorkouts).filter(Boolean).length;

  const totalWeightLifted = Object.values(exerciseLog).reduce((sum: number, log: any) => {
    if (log?.completed && log?.weight) return sum + log.weight * (log.actual_reps || log.reps || 1);
    return sum;
  }, 0);

  // ── Weekly volume ─────────────────────────────────────────────────────────

  const weeklyVolumeData = useMemo(() => {
    if (!user?.id) return [];
    const prefix = `${user.id}-`;
    const byWeek: Record<number, number> = {};

    Object.entries(exerciseLog).forEach(([key, log]: [string, any]) => {
      if (!key.startsWith(prefix) || !log?.completed || !log?.weight) return;
      const rest = key.slice(prefix.length);
      const hyphen = rest.indexOf('-');
      if (hyphen === -1) return;
      const week = parseInt(rest.slice(0, hyphen), 10);
      if (isNaN(week)) return;
      const vol = log.weight * (log.actual_reps || log.reps || 1);
      byWeek[week] = (byWeek[week] || 0) + vol;
    });

    return Object.entries(byWeek)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([week, vol]) => ({ label: `Wk ${week}`, value: Math.round(vol) }));
  }, [exerciseLog, user?.id]);

  // ── Strength levels ───────────────────────────────────────────────────────

  const maxForLevels = sortedMaxes[0]?.[1] as number | undefined;

  const hasAnyData = totalSetsLogged > 0 || totalMaxes > 0;

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
          value={
            totalWeightLifted >= 1000
              ? `${(totalWeightLifted / 1000).toFixed(1)}k`
              : totalWeightLifted
          }
          color="#a855f7"
        />
      </View>

      {/* Pro-gated charts */}
      {isPro ? (
        <>
          {/* Weekly Volume */}
          {weeklyVolumeData.length > 0 && (
            <ChartCard title="Weekly Volume (lbs)">
              <VolumeBarChart data={weeklyVolumeData} />
            </ChartCard>
          )}

          {/* 1RM Strength History */}
          {sortedMaxes.length > 0 && (
            <ChartCard title="Strength History">
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 12 }}
              >
                {sortedMaxes.map(([name]) => (
                  <LiftChip
                    key={name}
                    label={name}
                    selected={selectedLift === name}
                    onPress={() => setSelectedLift(name)}
                  />
                ))}
              </ScrollView>

              {historyLoading ? (
                <View className="items-center py-8">
                  <ActivityIndicator color="#3b82f6" />
                </View>
              ) : (
                <StrengthLineChart data={liftHistory} />
              )}
            </ChartCard>
          )}

          {/* Strength Levels */}
          {sortedMaxes.length > 0 && maxForLevels && (
            <ChartCard title="Current 1RM">
              <View className="gap-3">
                {sortedMaxes.map(([name, weight]) => {
                  const pct = ((weight as number) / maxForLevels) * 100;
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
            </ChartCard>
          )}
        </>
      ) : (
        <ProGateBanner onUpgrade={handleUpgrade} />
      )}

      {/* Empty state */}
      {!hasAnyData && (
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
