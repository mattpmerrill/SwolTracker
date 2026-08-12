import { useEffect, useMemo, useState } from 'react';
import { db } from '../lib/supabase';
import {
  shouldPromptWeekEndReview,
  summarizeWeekTraining,
} from '../lib/programContinuity';
import { getWeekDates, getTodayDayName } from '../utils/date';
import {
  WeekSelector,
  DaySelector,
  WorkoutFocus,
  ExerciseCard,
  NoWorkoutState,
  RestDayState,
  WeekEndReviewCard,
} from '../components/Workout';
import CoachNoteCard from '../components/AgentChat/CoachNoteCard';
import CoachBoardEntry from '../components/AgentChat/CoachBoardEntry';
import PostWorkoutCoachPrompt from '../components/AgentChat/PostWorkoutCoachPrompt';

/**
 * Workout tab screen composition
 */
export default function WorkoutScreen({
  workoutProgram,
  currentWeek,
  currentDay,
  actualCurrentWeek,
  programStartDate,
  user,
  groupRole,
  groupLeader,
  gymId,
  exerciseLogSize,
  onPreviousWeek,
  onNextWeek,
  onDayChange,
  onGoToCurrentWeek,
  onGenerateWorkout,
  isSetLogged,
  onLogSet,
  onAddMax,
  getCompletionPercentage,
  isWorkoutComplete,
  onToggleWorkoutComplete,
  isWorkoutMissed,
  getMissedReason,
  onMarkMissed,
  onClearMissed,
  swapState,
  onRequestSwap,
  onAcceptSwap,
  onCancelSwap,
  latestCoachNote,
  onOpenAgentChat,
  hasAgentKey = false,
  coachHasUnread = false,
  coachSending = false,
  onSendCoachNote,
}) {
  const [overloadByExercise, setOverloadByExercise] = useState({});
  const [dismissedWeekEndReview, setDismissedWeekEndReview] = useState(null);
  const availableWeeks = Object.keys(workoutProgram || {})
    .map((week) => Number(week))
    .filter((week) => Number.isFinite(week))
    .sort((a, b) => a - b);
  const minAvailableWeek = availableWeeks[0] || 1;
  const maxAvailableWeek = availableWeeks[availableWeeks.length - 1] || actualCurrentWeek;

  const weekDates = getWeekDates(programStartDate, currentWeek);
  const todayWorkout = workoutProgram[currentWeek]?.[currentDay];
  const hasWorkoutProgrammed = workoutProgram[currentWeek] !== undefined;
  const todayDayName = getTodayDayName();
  const isViewingToday = currentWeek === actualCurrentWeek && currentDay === todayDayName;
  const dayComplete = user?.id
    ? isWorkoutComplete(currentWeek, currentDay, user.id)
    : false;

  const nextProgramWeek = actualCurrentWeek + 1;
  const weekEndSummary = useMemo(() => {
    if (!user?.id || !workoutProgram?.[actualCurrentWeek]) return null;
    return summarizeWeekTraining({
      weekProgram: workoutProgram[actualCurrentWeek],
      weekNumber: actualCurrentWeek,
      userId: user.id,
      isWorkoutComplete,
      isWorkoutMissed,
    });
  }, [user?.id, workoutProgram, actualCurrentWeek, isWorkoutComplete, isWorkoutMissed, exerciseLogSize]);

  const showWeekEndReview = useMemo(() => {
    if (dismissedWeekEndReview === nextProgramWeek) return false;
    // Surface on current-week view so it doesn't interrupt history browsing
    if (currentWeek !== actualCurrentWeek) return false;
    return shouldPromptWeekEndReview({
      workoutProgram,
      actualCurrentWeek,
      todayDayName,
      userId: user?.id,
      groupRole,
      isWorkoutComplete,
      isWorkoutMissed,
    });
  }, [
    dismissedWeekEndReview,
    nextProgramWeek,
    currentWeek,
    actualCurrentWeek,
    workoutProgram,
    todayDayName,
    user?.id,
    groupRole,
    isWorkoutComplete,
    isWorkoutMissed,
    exerciseLogSize,
  ]);

  const overloadCount = Object.keys(overloadByExercise).length;

  useEffect(() => {
    let isCancelled = false;

    const loadOverloadRecommendations = async () => {
      if (!gymId || !user?.id) return;

      const overload = await db.getOverloadRecommendations(user.id, gymId, 4);
      if (!isCancelled) {
        setOverloadByExercise(overload?.byExercise || {});
      }
    };

    loadOverloadRecommendations();

    return () => {
      isCancelled = true;
    };
  }, [gymId, user?.id, currentWeek, exerciseLogSize]);

  return (
    <>
      {/* Phase 3.5 — Coach Board primary entry (not FAB-only) */}
      {hasAgentKey && (
        <CoachBoardEntry
          hasUnread={coachHasUnread}
          hasLatestNote={!!latestCoachNote}
          onOpen={onOpenAgentChat}
        />
      )}

      {/* Latest coach review / program note preview */}
      {latestCoachNote && (
        <CoachNoteCard note={latestCoachNote} onOpenChat={onOpenAgentChat} />
      )}

      {/* Phase 3.7 — week-end Review + Generate continuity */}
      {showWeekEndReview && weekEndSummary && (
        <WeekEndReviewCard
          currentWeek={actualCurrentWeek}
          nextWeek={nextProgramWeek}
          summary={weekEndSummary}
          overloadCount={overloadCount}
          onReviewAndGenerate={() => onGenerateWorkout(nextProgramWeek, { weekCount: 1 })}
          onDismiss={() => setDismissedWeekEndReview(nextProgramWeek)}
        />
      )}

      {/* Week Selector */}
      <WeekSelector
        currentWeek={currentWeek}
        actualCurrentWeek={actualCurrentWeek}
        weekDates={weekDates}
        onPreviousWeek={onPreviousWeek}
        onNextWeek={onNextWeek}
        workoutProgram={workoutProgram}
        isWorkoutComplete={isWorkoutComplete}
        userId={user?.id}
        minAvailableWeek={minAvailableWeek}
        maxAvailableWeek={maxAvailableWeek}
      />

      {/* Day Selector */}
      <DaySelector
        currentDay={currentDay}
        currentWeek={currentWeek}
        actualCurrentWeek={actualCurrentWeek}
        weekDates={weekDates}
        onDayChange={onDayChange}
        isWorkoutComplete={isWorkoutComplete}
        isWorkoutMissed={isWorkoutMissed}
        workoutProgram={workoutProgram}
        userId={user?.id}
      />

      {/* No Workout Programmed State */}
      {!hasWorkoutProgrammed && (
        <NoWorkoutState
          currentWeek={currentWeek}
          actualCurrentWeek={actualCurrentWeek}
          groupRole={groupRole}
          groupLeader={groupLeader}
          onGenerateWorkout={() => onGenerateWorkout(currentWeek, { weekCount: 1 })}
          onGoToCurrentWeek={onGoToCurrentWeek}
        />
      )}

      {/* Today's Focus */}
      {hasWorkoutProgrammed && todayWorkout && (
        <WorkoutFocus
          currentDay={currentDay}
          workout={todayWorkout}
          completionPercentage={getCompletionPercentage(currentWeek, currentDay, user.id)}
          isWorkoutComplete={dayComplete}
          isWorkoutMissed={isWorkoutMissed?.(currentWeek, currentDay, user.id)}
          missedReason={getMissedReason?.(currentWeek, currentDay, user.id)}
          onToggleComplete={() => onToggleWorkoutComplete(currentWeek, currentDay)}
          onMarkMissed={onMarkMissed}
          onClearMissed={onClearMissed}
        />
      )}

      {/* Phase 3.6 — post-workout note to agent */}
      {hasAgentKey && hasWorkoutProgrammed && dayComplete && todayWorkout?.focus !== 'Rest Day' && (
        <PostWorkoutCoachPrompt
          week={currentWeek}
          day={currentDay}
          focusLabel={todayWorkout?.focus}
          sending={coachSending}
          onSend={onSendCoachNote}
          onOpenFullBoard={onOpenAgentChat}
        />
      )}

      {/* Exercises */}
      {hasWorkoutProgrammed && (
        todayWorkout?.focus === 'Rest Day' ? (
          <RestDayState />
        ) : (
          <div className="space-y-4">
            {todayWorkout?.exercises?.map((exercise, exIdx) => (
              <ExerciseCard
                key={exIdx}
                exercise={exercise}
                exerciseIndex={exIdx}
                userMaxes={user?.maxes}
                overloadRecommendation={overloadByExercise[exercise.name.toLowerCase()]}
                isWorkoutComplete={isWorkoutComplete(currentWeek, currentDay, user.id)}
                isSetLogged={(exerciseIndex, setIndex) => isSetLogged(exerciseIndex, setIndex, user.id)}
                onLogSet={onLogSet}
                onAddMax={onAddMax}
                swapState={swapState}
                onRequestSwap={onRequestSwap}
                onAcceptSwap={onAcceptSwap}
                onCancelSwap={onCancelSwap}
              />
            ))}
          </div>
        )
      )}

      {/* Jump to Today floating button — only when not viewing today.
          bottom-24 clears BottomNav; Coach Board FAB no longer occupies this corner. */}
      {!isViewingToday && (
        <button
          type="button"
          onClick={onGoToCurrentWeek}
          className="float-above-tabbar fixed right-5 z-50 flex items-center gap-2 px-4 py-2.5 rounded-full bg-gradient-to-r from-orange-500 to-red-500 text-white text-sm font-semibold shadow-lg shadow-orange-500/30 hover:shadow-orange-500/50 hover:scale-105 active:scale-95 transition-all"
        >
          <span>↩</span>
          <span>Today</span>
        </button>
      )}
    </>
  );
}
