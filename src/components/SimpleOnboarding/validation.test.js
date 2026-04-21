import { describe, it, expect } from 'vitest';
import { canProceed, compileData, SCREEN_ORDER } from './validation';

const fullFields = {
  displayName: 'Matt',
  gender: 'male',
  age: 35,
  weight: 180,
  fitnessGoals: ['strength'],
  workoutDays: ['Monday', 'Wednesday'],
  workoutDuration: '1 hour',
  equipment: ['Barbell', 'Dumbbells'],
  workoutLocation: 'home',
  programStartDate: '2026-04-21',
};

describe('SimpleOnboarding validation', () => {
  it('SCREEN_ORDER lists the four form screens in flow order', () => {
    expect(SCREEN_ORDER).toEqual(['basics', 'training', 'equipment', 'dates']);
  });

  describe('canProceed(basics)', () => {
    it('accepts a fully populated basics block', () => {
      expect(canProceed('basics', fullFields)).toBe(true);
    });

    it('rejects missing name, empty gender, or non-positive age/weight', () => {
      expect(canProceed('basics', { ...fullFields, displayName: '   ' })).toBe(false);
      expect(canProceed('basics', { ...fullFields, gender: '' })).toBe(false);
      expect(canProceed('basics', { ...fullFields, age: 0 })).toBe(false);
      expect(canProceed('basics', { ...fullFields, weight: 0 })).toBe(false);
    });
  });

  describe('canProceed(training)', () => {
    it('accepts when goals, days, and duration are all set', () => {
      expect(canProceed('training', fullFields)).toBe(true);
    });

    it('rejects empty goals, empty days, or unset duration', () => {
      expect(canProceed('training', { ...fullFields, fitnessGoals: [] })).toBe(false);
      expect(canProceed('training', { ...fullFields, workoutDays: [] })).toBe(false);
      expect(canProceed('training', { ...fullFields, workoutDuration: '' })).toBe(false);
    });
  });

  describe('canProceed(equipment)', () => {
    it('accepts location + at least one piece of equipment', () => {
      expect(canProceed('equipment', fullFields)).toBe(true);
    });

    it('rejects empty equipment or unset location', () => {
      expect(canProceed('equipment', { ...fullFields, equipment: [] })).toBe(false);
      expect(canProceed('equipment', { ...fullFields, workoutLocation: '' })).toBe(false);
    });
  });

  describe('canProceed(dates)', () => {
    it('accepts any non-empty programStartDate', () => {
      expect(canProceed('dates', fullFields)).toBe(true);
    });

    it('rejects empty programStartDate', () => {
      expect(canProceed('dates', { ...fullFields, programStartDate: '' })).toBe(false);
      expect(canProceed('dates', { ...fullFields, programStartDate: null })).toBe(false);
    });
  });

  it('compileData renames weight to weightLbs and preserves other fields', () => {
    expect(compileData(fullFields)).toEqual({
      displayName: 'Matt',
      gender: 'male',
      age: 35,
      weightLbs: 180,
      fitnessGoals: ['strength'],
      workoutDays: ['Monday', 'Wednesday'],
      workoutDuration: '1 hour',
      workoutLocation: 'home',
      equipment: ['Barbell', 'Dumbbells'],
      programStartDate: '2026-04-21',
    });
  });
});
