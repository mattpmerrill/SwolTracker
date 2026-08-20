import { useEffect, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { db } from '../lib/supabase';
import {
  shouldPromptWeekEndReview,
  summarizeWeekTraining,
  buildWeekEndNotes,
} from '../lib/programContinuity';
import { getWeekSessionNotes } from '../lib/sessionNotes';
import { buildSquadStatuses } from '../lib/squadStatus';
import { getWeekDates, getTodayDayName } from '../utils/date';
import { unlockRestAudio } from '../utils/restCue';
import {
  WeekSelector,
  DaySelector,
  WorkoutFocus,
  ExerciseCard,
  RestTimer,
  NoWorkoutState,
  RestDayState,
  WeekEndReviewCard,
  SquadStrip,
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
  groupMembers = [],
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
  const [showThisWeek, setShowThisWeek] = useState(false);
  const [sessionRest, setSessionRest] = useState(null);
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

  const weekEndNotes = useMemo(() => {
    if (!weekEndSummary) return '';
    return buildWeekEndNotes({
      summary: weekEndSummary,
      weekNumber: actualCurrentWeek,
      userId: user?.id,
      getMissedReason,
      overloadCount,
      sessionNotes: getWeekSessionNotes(actualCurrentWeek),
    });
  }, [weekEndSummary, actualCurrentWeek, user?.id, getMissedReason, overloadCount, exerciseLogSize]);

  const squad = useMemo(() => {
    if (!isViewingToday) return [];
    return buildSquadStatuses({
      currentUserId: user?.id,
      userName: user?.display_name || user?.name,
      groupRole,
      groupLeader,
      groupMembers,
      week: actualCurrentWeek,
      day: todayDayName,
      isWorkoutComplete,
      isWorkoutMissed,
    });
  }, [
    isViewingToday,
    user?.id,
    user?.display_name,
    user?.name,
    groupRole,
    groupLeader,
    groupMembers,
    actualCurrentWeek,
    todayDayName,
    isWorkoutComplete,
    isWorkoutMissed,
    exerciseLogSize,
  ]);

  const handleAskCoachForNextWeek = async () => {
    const body = weekEndNotes
      ? `Week-end review — please plan Week ${nextProgramWeek}.\n\n${weekEndNotes}`
      : `Week-end review — please plan Week ${nextProgramWeek}.`;
    const ok = await onSendCoachNote?.(body);
    onOpenAgentChat?.();
    if (ok !== false) setDismissedWeekEndReview(nextProgramWeek);
  };

  useEffect(() => {
    if (!isViewingToday) setShowThisWeek(true);
  }, [isViewingToday]);

  const handleRestStart = (payload) => {
    unlockRestAudio();
    setSessionRest({ ...payload, id: Date.now() });
  };

  const weekPicker = (
    <>
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
    </>
  );

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

  const session = (
    <>
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

      {hasWorkoutProgrammed && todayWorkout && (
        <WorkoutFocus
          currentDay={currentDay}
          isViewingToday={isViewingToday}
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

      {isViewingToday && squad.length > 0 && (
        <SquadStrip people={squad} dayLabel={todayDayName} />
      )}

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

      {hasWorkoutProgrammed && (
        todayWorkout?.focus === 'Rest Day' ? (
          <RestDayState />
        ) : (
          <div className="space-y-4">
            {todayWorkout?.exercises?.map((exercise, exIdx) => (
              <ExerciseCard
                key={`${currentWeek}-${currentDay}-${exIdx}-${exercise.name}`}
                exercise={exercise}
                exerciseIndex={exIdx}
                currentWeek={currentWeek}
                currentDay={currentDay}
                userMaxes={user?.maxes}
                overloadRecommendation={overloadByExercise[exercise.name.toLowerCase()]}
                isWorkoutComplete={isWorkoutComplete(currentWeek, currentDay, user.id)}
                isSetLogged={(exerciseIndex, setIndex) => isSetLogged(exerciseIndex, setIndex, user.id)}
                onLogSet={onLogSet}
                onAddMax={onAddMax}
                onRestStart={handleRestStart}
                swapState={swapState}
                onRequestSwap={onRequestSwap}
                onAcceptSwap={onAcceptSwap}
                onCancelSwap={onCancelSwap}
              />
            ))}
          </div>
        )
      )}
    </>
  );

  return (
    <>
      {session}

      {showWeekEndReview && weekEndSummary && (
        <div className="mt-6">
          <WeekEndReviewCard
            currentWeek={actualCurrentWeek}
            nextWeek={nextProgramWeek}
            summary={weekEndSummary}
            overloadCount={overloadCount}
            hasAgentKey={hasAgentKey}
            onReviewAndGenerate={() => onGenerateWorkout(nextProgramWeek, {
              weekCount: 1,
              notes: weekEndNotes,
            })}
            onAskCoach={handleAskCoachForNextWeek}
            onDismiss={() => setDismissedWeekEndReview(nextProgramWeek)}
          />
        </div>
      )}

      <div className="mt-6">
        <button
          type="button"
          onClick={() => setShowThisWeek((open) => !open)}
          className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-zinc-900/60 border border-zinc-800/80 text-left hover:border-zinc-700 transition-colors"
          aria-expanded={showThisWeek}
        >
          <div>
            <p className="text-sm font-semibold text-white">This week</p>
            <p className="text-xs text-zinc-500 mt-0.5">
              {isViewingToday
                ? `Week ${currentWeek} · ${currentDay}`
                : `Viewing Week ${currentWeek} · ${currentDay}`}
            </p>
          </div>
          <ChevronDown
            className={`w-5 h-5 text-zinc-500 transition-transform ${showThisWeek ? 'rotate-180' : ''}`}
          />
        </button>
        {showThisWeek && <div className="mt-4">{weekPicker}</div>}
      </div>

      {hasAgentKey && (
        <div className="mt-4">
          <CoachBoardEntry
            hasUnread={coachHasUnread}
            hasLatestNote={!!latestCoachNote}
            onOpen={onOpenAgentChat}
          />
        </div>
      )}
      {latestCoachNote && (
        <CoachNoteCard note={latestCoachNote} onOpenChat={onOpenAgentChat} />
      )}

      {sessionRest && (
        <RestTimer
          key={sessionRest.id}
          exerciseName={sessionRest.exerciseName}
          setIndex={sessionRest.setIndex}
          totalSets={sessionRest.totalSets}
          restSeconds={sessionRest.restSeconds}
          onDismiss={() => setSessionRest(null)}
        />
      )}

      {!isViewingToday && (
        <button
          type="button"
          onClick={() => {
            onGoToCurrentWeek();
            setShowThisWeek(false);
          }}
          className="float-above-tabbar fixed right-5 z-50 flex items-center gap-2 px-4 py-2.5 rounded-full bg-gradient-to-r from-orange-500 to-red-500 text-white text-sm font-semibold shadow-lg shadow-orange-500/30 hover:shadow-orange-500/50 hover:scale-105 active:scale-95 transition-all"
        >
          <span>↩</span>
          <span>Today</span>
        </button>
      )}
    </>
  );
}
