import { useEffect, useRef, useCallback, useState } from 'react';
import { View, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import ConfettiCannon from 'react-native-confetti-cannon';

import { useAuth } from '../../contexts/AuthContext';
import { useWorkoutStore } from '../../stores/workoutStore';
import { useProfileStore } from '../../stores/profileStore';
import { useAiStore } from '../../stores/aiStore';
import { calculateCurrentWeek, getTodayDayName } from '../../../src/utils/date';

import { WeekSelector } from '../../components/workout/WeekSelector';
import { DaySelector } from '../../components/workout/DaySelector';
import { WorkoutFocus } from '../../components/workout/WorkoutFocus';
import { ExerciseCard } from '../../components/workout/ExerciseCard';
import { NoWorkoutState, RestDayState } from '../../components/workout/EmptyStates';
import { RestTimerModal } from '../../components/workout/RestTimerModal';
import { loadHealthPrefs, writeWorkoutToHealth } from '../../lib/health';
import { useSubscriptionStore } from '../../stores/subscriptionStore';
import { incrementAiGenerationCount } from '../../lib/purchases';

export default function WorkoutScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const confettiRef = useRef<ConfettiCannon>(null);
  const [showRestTimer, setShowRestTimer] = useState(false);

  const {
    workoutProgram,
    exerciseLog,
    currentWeek,
    currentDay,
    setCurrentWeek,
    setCurrentDay,
    loadWorkoutData,
    logSet,
    isSetLogged,
    getCompletionPercentage,
    toggleWorkoutComplete,
  } = useWorkoutStore();

  const { profile, maxes, equipment, gymId, loadProfile } = useProfileStore();
  const { openAiGenerator } = useAiStore();
  const { canUseAi, openPaywall, refreshAiCount } = useSubscriptionStore();

  const programStartDate = profile?.program_start_date || null;
  const actualCurrentWeek = programStartDate
    ? calculateCurrentWeek(programStartDate)
    : 1;

  // Initialize data
  useEffect(() => {
    if (!user?.id) return;
    loadProfile(user.id);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || !gymId) return;
    loadWorkoutData(user.id, gymId);
  }, [user?.id, gymId]);

  // Set initial day/week
  useEffect(() => {
    if (!currentDay) {
      setCurrentDay(getTodayDayName());
    }
    if (programStartDate) {
      setCurrentWeek(actualCurrentWeek);
    }
  }, [programStartDate]);

  const todayWorkout = workoutProgram[currentWeek]?.[currentDay];
  const exercises = todayWorkout?.exercises || [];
  const focus = todayWorkout?.focus || '';
  const isRestDay = focus.toLowerCase().includes('rest');

  const completionPct = user?.id
    ? getCompletionPercentage(user.id, currentWeek, currentDay)
    : 0;
  const workoutComplete = useWorkoutStore(
    (s) => s.completedWorkouts[`${user?.id}-${currentWeek}-${currentDay}`] || false
  );

  const handleLogSet = useCallback(
    async (exerciseIndex: number, setIndex: number, data: any) => {
      if (!user?.id || !gymId) return;
      await logSet(user.id, gymId, exerciseIndex, setIndex, data);
    },
    [user?.id, gymId, logSet]
  );

  const handleToggleComplete = useCallback(async () => {
    if (!user?.id || !gymId) return;
    const nowComplete = await toggleWorkoutComplete(user.id, gymId, currentWeek, currentDay);
    if (nowComplete && completionPct === 100) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      confettiRef.current?.start();

      // Write to Apple Health if enabled
      const healthPrefs = loadHealthPrefs();
      if (healthPrefs.syncWorkoutsEnabled) {
        const totalVolume = Object.values(exerciseLog).reduce((sum: number, log: any) => {
          if (log?.completed && log?.weight) {
            return sum + log.weight * (log.actual_reps || log.reps || 1);
          }
          return sum;
        }, 0);
        const endDate = new Date();
        // Estimate ~1.5 min per set as workout start time
        const totalSets = exercises.reduce((n: number, ex: any) => n + (ex.sets || 0), 0);
        const startDate = new Date(endDate.getTime() - totalSets * 90_000);
        writeWorkoutToHealth({ startDate, endDate, totalVolumeLbs: totalVolume }).catch(() => {});
      }
    }
  }, [user?.id, gymId, currentWeek, currentDay, completionPct, exerciseLog, exercises]);

  const handleSetCompleted = useCallback(() => {
    setShowRestTimer(true);
  }, []);

  const handleGenerateWorkout = useCallback(() => {
    if (!canUseAi) {
      openPaywall();
      router.push('/(modals)/paywall');
      return;
    }
    openAiGenerator(currentWeek);
    router.push('/(modals)/ai-generator');
  }, [currentWeek, canUseAi, openPaywall]);

  const handleBackToCurrentWeek = useCallback(() => {
    setCurrentWeek(actualCurrentWeek);
    setCurrentDay(getTodayDayName());
  }, [actualCurrentWeek]);

  const handleIsSetLogged = useCallback(
    (exerciseIndex: number, setIndex: number) => {
      if (!user?.id) return false;
      return isSetLogged(user.id, exerciseIndex, setIndex);
    },
    [user?.id, isSetLogged]
  );

  return (
    <View className="flex-1 bg-zinc-950">
      <WeekSelector
        currentWeek={currentWeek}
        actualCurrentWeek={actualCurrentWeek}
        programStartDate={programStartDate}
        onPreviousWeek={() => setCurrentWeek(Math.max(1, currentWeek - 1))}
        onNextWeek={() => setCurrentWeek(currentWeek + 1)}
      />

      <DaySelector
        currentDay={currentDay}
        currentWeek={currentWeek}
        actualCurrentWeek={actualCurrentWeek}
        onDayChange={setCurrentDay}
      />

      {!workoutProgram[currentWeek] ? (
        <NoWorkoutState
          currentWeek={currentWeek}
          onGenerateWorkout={handleGenerateWorkout}
          onBackToCurrentWeek={handleBackToCurrentWeek}
        />
      ) : isRestDay ? (
        <RestDayState />
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingVertical: 12, gap: 12 }}
          showsVerticalScrollIndicator={false}
        >
          <WorkoutFocus
            focus={focus}
            exerciseCount={exercises.length}
            completionPercentage={completionPct}
            isWorkoutComplete={workoutComplete}
            onToggleComplete={handleToggleComplete}
          />

          {exercises.map((exercise: any, idx: number) => (
            <ExerciseCard
              key={`${exercise.name}-${idx}`}
              exercise={exercise}
              exerciseIndex={idx}
              userMaxes={maxes}
              isSetLogged={handleIsSetLogged}
              onLogSet={handleLogSet}
              onSetCompleted={handleSetCompleted}
              disabled={workoutComplete}
            />
          ))}
        </ScrollView>
      )}

      <RestTimerModal
        visible={showRestTimer}
        onClose={() => setShowRestTimer(false)}
      />

      <ConfettiCannon
        ref={confettiRef}
        count={150}
        origin={{ x: -10, y: 0 }}
        autoStart={false}
        fadeOut
        colors={['#f97316', '#ef4444', '#22c55e', '#3b82f6', '#a855f7']}
      />
    </View>
  );
}
