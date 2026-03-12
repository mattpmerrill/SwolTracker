import { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Brain, X, Sparkles, RotateCcw, TrendingUp, ShieldAlert, PauseCircle } from 'lucide-react-native';

import { useAuth } from '../../contexts/AuthContext';
import { useAiStore } from '../../stores/aiStore';
import { useProfileStore } from '../../stores/profileStore';
import { useWorkoutStore } from '../../stores/workoutStore';
import { useSubscriptionStore } from '../../stores/subscriptionStore';
import { incrementAiGenerationCount } from '../../lib/purchases';
import { Button } from '../../components/ui';

const LOADING_PHRASES = [
  "Calculating optimal gains...",
  "Channeling Arnold's spirit...",
  "Teaching AI to count reps...",
  "Warming up the algorithm...",
  "Calibrating pump levels...",
  "Optimizing for maximum swoleness...",
  "Building your gains blueprint...",
  "No curls in the squat rack, promise...",
  "Converting pizza into protein math...",
];

export default function AiGeneratorModal() {
  const router = useRouter();
  const { user } = useAuth();
  const { profiles, equipment, gymId } = useProfileStore();
  const { workoutProgram, updateWorkoutProgram, setCurrentWeek } = useWorkoutStore();

  const {
    aiNotes, setAiNotes,
    aiLoading, aiError,
    generationContextLoading,
    generatedPreview, generationWeek,
    weekCount, setWeekCount,
    previewWeek, setPreviewWeek,
    trainingHistorySummary, overloadRecommendations,
    loadGenerationContext,
    generateAiWorkout, confirmGeneratedWorkout,
    setShowAiGenerator,
  } = useAiStore();

  const { refreshAiCount } = useSubscriptionStore();

  const [loadingPhrase, setLoadingPhrase] = useState(0);

  useEffect(() => {
    if (!aiLoading) return;
    setLoadingPhrase(Math.floor(Math.random() * LOADING_PHRASES.length));
    const interval = setInterval(() => {
      setLoadingPhrase((prev) => (prev + 1) % LOADING_PHRASES.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [aiLoading]);

  useEffect(() => {
    if (!user?.id || !gymId) return;
    loadGenerationContext({ currentUser: user.id, gymId });
  }, [user?.id, gymId, generationWeek]);

  const handleGenerate = () => {
    if (!user?.id || !gymId) return;
    generateAiWorkout({ currentUser: user.id, profiles, equipment, workoutProgram, gymId });
  };

  const handleConfirm = async () => {
    if (!user?.id || !gymId) return;
    await confirmGeneratedWorkout({
      currentUser: user.id,
      gymId,
      onComplete: (updates, startWeek) => {
        incrementAiGenerationCount();
        refreshAiCount();
        updateWorkoutProgram(updates);
        setCurrentWeek(startWeek);
        router.back();
      },
    });
  };

  const handleClose = () => {
    setShowAiGenerator(false);
    router.back();
  };

  // Preview day names
  const previewDays = generatedPreview?.[previewWeek]
    ? Object.keys(generatedPreview[previewWeek])
    : [];
  const recommendationIcon = {
    increase: TrendingUp,
    deload: ShieldAlert,
    stale: PauseCircle,
  } as const;

  return (
    <View className="flex-1 bg-zinc-950">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 pt-14 pb-3">
        <View className="flex-row items-center">
          <Brain size={24} color="#f97316" />
          <Text className="text-zinc-50 text-xl font-bold ml-2">AI Coach</Text>
        </View>
        <Pressable onPress={handleClose} className="p-2">
          <X size={22} color="#a1a1aa" />
        </Pressable>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, gap: 16 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Loading State */}
        {aiLoading && (
          <View className="items-center py-16">
            <View className="w-20 h-20 bg-orange-500 rounded-3xl items-center justify-center mb-6">
              <ActivityIndicator size="large" color="white" />
            </View>
            <Text className="text-zinc-50 text-xl font-bold text-center mb-3">
              Generating Your Program
            </Text>
            <Text className="text-zinc-400 text-base text-center mb-6">
              {LOADING_PHRASES[loadingPhrase]}
            </Text>
            <View className="w-48 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <View className="h-full bg-orange-500 rounded-full w-2/3" />
            </View>
          </View>
        )}

        {/* Error State */}
        {aiError && !aiLoading && (
          <View className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4">
            <Text className="text-red-400 font-medium mb-2">{aiError}</Text>
            <Button title="Try Again" onPress={handleGenerate} variant="secondary" icon={<RotateCcw size={16} color="#a1a1aa" />} />
          </View>
        )}

        {/* Configuration (before generation) */}
        {!generatedPreview && !aiLoading && (
          <>
            <Text className="text-zinc-50 text-lg font-bold">
              Review + Generate Week {generationWeek} Program
            </Text>

            <View className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800/50">
              <Text className="text-zinc-300 text-sm font-medium mb-3">Training History Review</Text>
              {generationContextLoading ? (
                <View className="flex-row items-center gap-2">
                  <ActivityIndicator size="small" color="#f97316" />
                  <Text className="text-zinc-400 text-sm">Loading recent training data...</Text>
                </View>
              ) : trainingHistorySummary?.weeks?.length ? (
                <View className="gap-3">
                  {[...trainingHistorySummary.weeks].reverse().map((week: any) => (
                    <View key={week.week_number} className="rounded-xl bg-zinc-800 px-3 py-3">
                      <View className="flex-row items-center justify-between">
                        <Text className="text-zinc-100 font-semibold">Week {week.week_number}</Text>
                        <Text className="text-zinc-400 text-xs">
                          {week.completed_days.length}/{week.scheduled_days.length || week.completed_days.length} days
                        </Text>
                      </View>
                      {week.missed_days?.length > 0 && (
                        <Text className="text-amber-300 text-xs mt-2">
                          Missed: {week.missed_days.map((day: any) => `${day.day_name}${day.reason ? ` (${day.reason})` : ''}`).join(', ')}
                        </Text>
                      )}
                      {week.exercise_sessions?.slice(0, 2).map((session: any) => (
                        <Text key={`${week.week_number}-${session.day_name}-${session.exercise_name}`} className="text-zinc-400 text-xs mt-1">
                          {session.day_name} • {session.exercise_name} • {session.sets_logged} sets @ {session.avg_actual_weight || session.avg_prescribed_weight || 0} lbs
                        </Text>
                      ))}
                    </View>
                  ))}
                </View>
              ) : (
                <Text className="text-zinc-400 text-sm">No recent training history found yet.</Text>
              )}
            </View>

            <View className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800/50">
              <Text className="text-zinc-300 text-sm font-medium mb-3">Progressive Overload Signals</Text>
              {generationContextLoading ? (
                <View className="flex-row items-center gap-2">
                  <ActivityIndicator size="small" color="#f97316" />
                  <Text className="text-zinc-400 text-sm">Loading recommendations...</Text>
                </View>
              ) : overloadRecommendations.length > 0 ? (
                <View className="gap-2">
                  {overloadRecommendations.slice(0, 5).map((recommendation: any) => {
                    const Icon = recommendationIcon[recommendation.type as keyof typeof recommendationIcon] || TrendingUp;
                    const tone = recommendation.type === 'increase'
                      ? 'border-emerald-500/30 bg-emerald-500/10'
                      : recommendation.type === 'deload'
                      ? 'border-amber-500/30 bg-amber-500/10'
                      : 'border-zinc-700 bg-zinc-800';
                    const iconColor = recommendation.type === 'increase'
                      ? '#6ee7b7'
                      : recommendation.type === 'deload'
                      ? '#fcd34d'
                      : '#d4d4d8';
                    const textTone = recommendation.type === 'increase'
                      ? 'text-emerald-300'
                      : recommendation.type === 'deload'
                      ? 'text-amber-300'
                      : 'text-zinc-300';

                    return (
                      <View key={recommendation.exercise_name} className={`rounded-xl border px-3 py-3 ${tone}`}>
                        <View className="flex-row items-center">
                          <Icon size={14} color={iconColor} />
                          <Text className={`ml-2 font-semibold ${textTone}`}>{recommendation.status_label || recommendation.type}</Text>
                        </View>
                        <Text className={`text-xs mt-1 ${textTone}`}>{recommendation.message}</Text>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <Text className="text-zinc-400 text-sm">No overload adjustments flagged right now.</Text>
              )}
            </View>

            {/* Week Count */}
            <View className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800/50">
              <Text className="text-zinc-300 text-sm font-medium mb-3">Number of Weeks</Text>
              <View className="flex-row gap-2">
                {[1, 2, 4, 8].map((w) => (
                  <Pressable
                    key={w}
                    onPress={() => setWeekCount(w)}
                    className={`flex-1 py-2.5 rounded-xl items-center ${
                      weekCount === w ? 'bg-orange-500' : 'bg-zinc-800'
                    }`}
                  >
                    <Text className={`font-semibold ${weekCount === w ? 'text-white' : 'text-zinc-400'}`}>
                      {w}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Notes */}
            <View className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800/50">
              <Text className="text-zinc-300 text-sm font-medium mb-2">Notes for AI Coach</Text>
              <TextInput
                value={aiNotes}
                onChangeText={setAiNotes}
                placeholder="e.g. Focus on upper body, add more compound movements..."
                placeholderTextColor="#52525b"
                multiline
                numberOfLines={3}
                className="bg-zinc-800 text-zinc-100 rounded-xl px-4 py-3 text-sm min-h-[80px] border border-zinc-700"
                textAlignVertical="top"
              />
            </View>

            <Button title="Generate Workout" onPress={handleGenerate} icon={<Sparkles size={18} color="white" />} />
          </>
        )}

        {/* Preview */}
        {generatedPreview && !aiLoading && (
          <>
            <Text className="text-zinc-50 text-lg font-bold">Preview Generated Program</Text>

            {/* Week tabs */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row gap-2">
                {Object.keys(generatedPreview)
                  .filter((k) => k.startsWith('week'))
                  .sort()
                  .map((weekKey) => (
                    <Pressable
                      key={weekKey}
                      onPress={() => setPreviewWeek(weekKey)}
                      className={`px-4 py-2 rounded-xl ${
                        previewWeek === weekKey ? 'bg-orange-500' : 'bg-zinc-800'
                      }`}
                    >
                      <Text className={`font-semibold ${previewWeek === weekKey ? 'text-white' : 'text-zinc-400'}`}>
                        {weekKey.replace('week', 'Week ')}
                      </Text>
                    </Pressable>
                  ))}
              </View>
            </ScrollView>

            {/* Day previews */}
            {previewDays.map((day) => {
              const dayData = generatedPreview[previewWeek][day];
              return (
                <View key={day} className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800/50">
                  <View className="flex-row items-center justify-between mb-2">
                    <Text className="text-zinc-50 font-bold">{day}</Text>
                    <Text className="text-orange-400 text-sm">{dayData.focus}</Text>
                  </View>
                  {dayData.exercises?.map((ex: any, i: number) => (
                    <Text key={i} className="text-zinc-400 text-sm">
                      {ex.name} — {ex.sets}×{ex.reps}
                      {ex.percentages?.[0] ? ` @ ${ex.percentages[0]}%` : ''}
                    </Text>
                  ))}
                </View>
              );
            })}

            <View className="flex-row gap-3">
              <View className="flex-1">
                <Button title="Regenerate" onPress={handleGenerate} variant="secondary" />
              </View>
              <View className="flex-1">
                <Button title="Confirm" onPress={handleConfirm} />
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}
