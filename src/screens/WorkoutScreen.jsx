import { getWeekDates, getTodayDayName } from '../utils/date';
import { DAYS_OF_WEEK } from '../constants';
import {
  WeekSelector,
  DaySelector,
  WorkoutFocus,
  ExerciseCard,
  NoWorkoutState,
  RestDayState,
} from '../components/Workout';

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
  swapState,
  onRequestSwap,
  onAcceptSwap,
  onCancelSwap,
}) {
  const weekDates = getWeekDates(programStartDate, currentWeek);
  const todayWorkout = workoutProgram[currentWeek]?.[currentDay];
  const hasWorkoutProgrammed = workoutProgram[currentWeek] !== undefined;
  const todayDayName = getTodayDayName();
  const isViewingToday = currentWeek === actualCurrentWeek && currentDay === todayDayName;

  return (
    <>
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
      />

      {/* Day Selector */}
      <DaySelector
        currentDay={currentDay}
        currentWeek={currentWeek}
        actualCurrentWeek={actualCurrentWeek}
        weekDates={weekDates}
        onDayChange={onDayChange}
        isWorkoutComplete={isWorkoutComplete}
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
          onGenerateWorkout={() => onGenerateWorkout(currentWeek)}
          onGoToCurrentWeek={onGoToCurrentWeek}
        />
      )}

      {/* Today's Focus */}
      {hasWorkoutProgrammed && todayWorkout && (
        <WorkoutFocus
          currentDay={currentDay}
          workout={todayWorkout}
          completionPercentage={getCompletionPercentage(currentWeek, currentDay, user.id)}
          isWorkoutComplete={isWorkoutComplete(currentWeek, currentDay, user.id)}
          onToggleComplete={() => onToggleWorkoutComplete(currentWeek, currentDay)}
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

      {/* Jump to Today floating button — only shown when not viewing today */}
      {!isViewingToday && (
        <button
          onClick={onGoToCurrentWeek}
          className="fixed bottom-24 right-5 z-50 flex items-center gap-2 px-4 py-2.5 rounded-full bg-gradient-to-r from-orange-500 to-red-500 text-white text-sm font-semibold shadow-lg shadow-orange-500/30 hover:shadow-orange-500/50 hover:scale-105 active:scale-95 transition-all"
        >
          <span>↩</span>
          <span>Today</span>
        </button>
      )}
    </>
  );
}
