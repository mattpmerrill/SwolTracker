import { getWeekDates } from '../utils/date';
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
  isViewingBuddy,
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
}) {
  const weekDates = getWeekDates(programStartDate, currentWeek);
  const todayWorkout = workoutProgram[currentWeek]?.[currentDay];
  const hasWorkoutProgrammed = workoutProgram[currentWeek] !== undefined;

  return (
    <>
      {/* Week Selector */}
      <WeekSelector
        currentWeek={currentWeek}
        actualCurrentWeek={actualCurrentWeek}
        weekDates={weekDates}
        onPreviousWeek={onPreviousWeek}
        onNextWeek={onNextWeek}
      />

      {/* Day Selector */}
      <DaySelector
        currentDay={currentDay}
        currentWeek={currentWeek}
        actualCurrentWeek={actualCurrentWeek}
        weekDates={weekDates}
        onDayChange={onDayChange}
      />

      {/* No Workout Programmed State */}
      {!hasWorkoutProgrammed && (
        <NoWorkoutState
          currentWeek={currentWeek}
          actualCurrentWeek={actualCurrentWeek}
          groupRole={groupRole}
          groupLeader={groupLeader}
          isViewingBuddy={isViewingBuddy}
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
                isViewingBuddy={isViewingBuddy}
                isSetLogged={(exerciseIndex, setIndex) => isSetLogged(exerciseIndex, setIndex, user.id)}
                onLogSet={onLogSet}
                onAddMax={onAddMax}
              />
            ))}
          </div>
        )
      )}
    </>
  );
}
