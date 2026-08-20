import { describe, it, expect } from 'vitest';
import {
  getNextUnprogrammedWeek,
  getScheduledTrainingDays,
  summarizeWeekTraining,
  shouldPromptWeekEndReview,
  buildWeekEndNotes,
} from './programContinuity';

const weekProgram = {
  Monday: { focus: 'Upper', exercises: [{ name: 'Bench' }] },
  Tuesday: { focus: 'Rest Day', exercises: [] },
  Wednesday: { focus: 'Lower', exercises: [{ name: 'Squat' }] },
  Thursday: { focus: 'Rest Day', exercises: [] },
  Friday: { focus: 'Full', exercises: [{ name: 'Deadlift' }] },
  Saturday: { focus: 'Rest Day', exercises: [] },
  Sunday: { focus: 'Rest Day', exercises: [] },
};

describe('programContinuity', () => {
  it('getNextUnprogrammedWeek finds first gap', () => {
    expect(getNextUnprogrammedWeek({})).toBe(1);
    expect(getNextUnprogrammedWeek({ 1: {}, 2: {} })).toBe(3);
    expect(getNextUnprogrammedWeek({ 1: {}, 3: {} })).toBe(2);
  });

  it('getScheduledTrainingDays skips rest and empty days', () => {
    expect(getScheduledTrainingDays(weekProgram)).toEqual(['Monday', 'Wednesday', 'Friday']);
    expect(getScheduledTrainingDays(null)).toEqual([]);
  });

  it('summarizeWeekTraining tallies complete/missed/remaining', () => {
    const summary = summarizeWeekTraining({
      weekProgram,
      weekNumber: 5,
      userId: 'u1',
      isWorkoutComplete: (w, d) => w === 5 && d === 'Monday',
      isWorkoutMissed: (w, d) => w === 5 && d === 'Wednesday',
    });
    expect(summary.completedDays).toEqual(['Monday']);
    expect(summary.missedDays).toEqual(['Wednesday']);
    expect(summary.remainingDays).toEqual(['Friday']);
    expect(summary.allAccounted).toBe(false);
  });

  it('shouldPromptWeekEndReview is false for members or when next week exists', () => {
    expect(shouldPromptWeekEndReview({
      workoutProgram: { 10: weekProgram, 11: weekProgram },
      actualCurrentWeek: 10,
      todayDayName: 'Friday',
      userId: 'u1',
      groupRole: 'leader',
      isWorkoutComplete: () => false,
      isWorkoutMissed: () => false,
    })).toBe(false);

    expect(shouldPromptWeekEndReview({
      workoutProgram: { 10: weekProgram },
      actualCurrentWeek: 10,
      todayDayName: 'Friday',
      userId: 'u1',
      groupRole: 'member',
      isWorkoutComplete: () => false,
      isWorkoutMissed: () => false,
    })).toBe(false);
  });

  it('shouldPromptWeekEndReview true late in week when next week missing', () => {
    expect(shouldPromptWeekEndReview({
      workoutProgram: { 10: weekProgram },
      actualCurrentWeek: 10,
      todayDayName: 'Friday',
      userId: 'u1',
      groupRole: null,
      isWorkoutComplete: () => false,
      isWorkoutMissed: () => false,
    })).toBe(true);
  });

  it('shouldPromptWeekEndReview true when all training days accounted early', () => {
    expect(shouldPromptWeekEndReview({
      workoutProgram: { 10: weekProgram },
      actualCurrentWeek: 10,
      todayDayName: 'Tuesday',
      userId: 'u1',
      groupRole: 'leader',
      isWorkoutComplete: (_w, d) => ['Monday', 'Wednesday', 'Friday'].includes(d),
      isWorkoutMissed: () => false,
    })).toBe(true);
  });

  it('shouldPromptWeekEndReview false early in week with remaining days', () => {
    expect(shouldPromptWeekEndReview({
      workoutProgram: { 10: weekProgram },
      actualCurrentWeek: 10,
      todayDayName: 'Monday',
      userId: 'u1',
      groupRole: 'leader',
      isWorkoutComplete: () => false,
      isWorkoutMissed: () => false,
    })).toBe(false);
  });
});

describe('buildWeekEndNotes', () => {
  const summary = {
    completedDays: ['Monday'],
    missedDays: ['Wednesday'],
    remainingDays: ['Friday'],
  };

  it('includes skips with reasons, remaining days, overload, and session chips', () => {
    const notes = buildWeekEndNotes({
      summary,
      weekNumber: 5,
      userId: 'u1',
      getMissedReason: (_w, day) => (day === 'Wednesday' ? 'travel' : null),
      overloadCount: 2,
      sessionNotes: [{ day: 'Monday', text: 'Felt strong today.' }],
    });
    expect(notes).toContain('Completed: Monday.');
    expect(notes).toContain('Skipped: Wednesday (travel).');
    expect(notes).toContain('Still open: Friday.');
    expect(notes).toContain('2 overload signals this block.');
    expect(notes).toContain('- Monday: Felt strong today.');
  });

  it('returns empty string without a summary', () => {
    expect(buildWeekEndNotes({ summary: null })).toBe('');
  });
});
