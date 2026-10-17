import { describe, it, expect } from 'vitest';
import {
  blockBadgeLabel,
  parseCount,
  cleanCountInput,
  stepCount,
  parseClockInput,
  emptyDraft,
  draftFromScore,
  buildBlockScoreInput,
  cleanBlockScore,
  buildBlockMovementLogs,
  indexBlockScores,
  blockScoreKey,
  numberToBeatLabel,
  isNewBest,
  dayHasLoggedSet,
  getCoachNotes,
} from './blockScoreEntry';

const amrap = { id: 'forge', type: 'amrap', title: 'Forge AMRAP', time_cap_min: 12, exercise_indexes: [1, 2, 3, 4], benchmark: 'forge' };
const forTime = { id: 'grind', type: 'for_time', title: 'Grind', time_cap_min: 15, exercise_indexes: [0], rounds: 5 };

const exercises = [
  { name: 'Hang Power Cleans', sets: 3, reps: '3' },
  { name: 'Hang Power Cleans', sets: 1, reps: '10/rd', weight_lbs: 95 },
  { name: 'Push-Ups', sets: 1, reps: '12/rd' },
  { name: 'Bodyweight Squats', sets: 1, reps: '15/rd' },
  { name: 'Burpees', sets: 1, reps: '8/rd' },
];

describe('blockBadgeLabel', () => {
  it('labels an AMRAP with its cap', () => {
    expect(blockBadgeLabel(amrap)).toBe('AMRAP · 12 min');
  });

  it('labels For Time with rounds and cap, and drops rounds when unset', () => {
    expect(blockBadgeLabel(forTime)).toBe('For Time · 5 rounds · 15 min cap');
    expect(blockBadgeLabel({ ...forTime, rounds: 1 })).toBe('For Time · 1 round · 15 min cap');
    expect(blockBadgeLabel({ ...forTime, rounds: undefined })).toBe('For Time · 15 min cap');
  });
});

describe('count entry', () => {
  it('parses plain counts only', () => {
    expect(parseCount('5')).toBe(5);
    expect(parseCount(' 22 ')).toBe(22);
    expect(parseCount('')).toBeNull();
    expect(parseCount('5.5')).toBeNull();
    expect(parseCount('-1')).toBeNull();
    expect(parseCount('1000')).toBeNull();
  });

  it('keeps digits only and at most three of them', () => {
    expect(cleanCountInput('5 rounds')).toBe('5');
    expect(cleanCountInput('-3')).toBe('3');
    expect(cleanCountInput('12345')).toBe('123');
    expect(cleanCountInput(undefined)).toBe('');
  });

  it('steps within 0..max and from 0 when blank', () => {
    expect(stepCount('', 1)).toBe('1');
    expect(stepCount('3', 1)).toBe('4');
    expect(stepCount('0', -1)).toBe('0');
    expect(stepCount('999', 1)).toBe('999');
    expect(stepCount('abc', 1)).toBe('1');
  });
});

describe('parseClockInput', () => {
  it('reads m:ss and h:mm:ss', () => {
    expect(parseClockInput('11:42')).toBe(702);
    expect(parseClockInput(' 0:59 ')).toBe(59);
    expect(parseClockInput('1:05:09')).toBe(3909);
  });

  it('refuses ambiguous or malformed input', () => {
    expect(parseClockInput('12')).toBeNull();
    expect(parseClockInput('11:7')).toBeNull();
    expect(parseClockInput('11:75')).toBeNull();
    expect(parseClockInput('0:00')).toBeNull();
    expect(parseClockInput('')).toBeNull();
    expect(parseClockInput(null)).toBeNull();
    expect(parseClockInput('1:75:00')).toBeNull();
  });
});

describe('draftFromScore', () => {
  it('round-trips a saved score into the form fields', () => {
    expect(draftFromScore({ rounds: 5, reps: 22, time_seconds: null, capped: false, note: 'solid' })).toEqual({
      rounds: '5', reps: '22', finish: '', capped: false, note: 'solid',
    });
    expect(draftFromScore({ rounds: null, reps: null, time_seconds: 702, capped: false, note: null })).toMatchObject({ finish: '11:42', note: '' });
    expect(draftFromScore(null)).toEqual(emptyDraft());
  });

  it('what Edit shows rebuilds the same score', () => {
    const saved = { rounds: 4, reps: 3, time_seconds: null, capped: true, note: null };
    const input = buildBlockScoreInput(forTime, draftFromScore(saved));
    expect(input).toMatchObject({ rounds: 4, reps: 3, capped: true, time_seconds: null });
  });
});

describe('buildBlockScoreInput', () => {
  it('AMRAP: rounds required, extra reps default to 0, no time', () => {
    const input = buildBlockScoreInput(amrap, { ...emptyDraft(), rounds: '5', reps: '22' });
    expect(input).toMatchObject({ block_id: 'forge', benchmark: 'forge', score_type: 'amrap', rounds: 5, reps: 22, time_seconds: null, capped: false });
    expect(buildBlockScoreInput(amrap, { ...emptyDraft(), rounds: '5' }).reps).toBe(0);
    expect(buildBlockScoreInput(amrap, emptyDraft()).rounds).toBeNull();
  });

  it('AMRAP ignores a leftover finish time and cap toggle', () => {
    const input = buildBlockScoreInput(amrap, { ...emptyDraft(), rounds: '4', finish: '9:00', capped: true });
    expect(input.time_seconds).toBeNull();
    expect(input.capped).toBe(false);
  });

  it('For Time finished: only the time is kept', () => {
    const input = buildBlockScoreInput(forTime, { ...emptyDraft(), finish: '11:42', rounds: '3', reps: '4' });
    expect(input).toMatchObject({ score_type: 'for_time', time_seconds: 702, rounds: null, reps: null, capped: false, benchmark: null });
  });

  it('For Time capped: rounds and reps kept, time dropped', () => {
    const input = buildBlockScoreInput(forTime, { ...emptyDraft(), capped: true, rounds: '4', reps: '3', finish: '9:00' });
    expect(input).toMatchObject({ capped: true, rounds: 4, reps: 3, time_seconds: null });
  });

  it('trims the note and nulls a blank one', () => {
    expect(buildBlockScoreInput(amrap, { ...emptyDraft(), rounds: '1', note: '  felt good ' }).note).toBe('felt good');
    expect(buildBlockScoreInput(amrap, { ...emptyDraft(), rounds: '1', note: '   ' }).note).toBeNull();
  });
});

describe('cleanBlockScore', () => {
  it('fills omitted optionals with null', () => {
    expect(cleanBlockScore({ block_id: 'forge', score_type: 'amrap', rounds: 5, capped: false })).toEqual({
      block_id: 'forge', benchmark: null, score_type: 'amrap', rounds: 5, reps: null, time_seconds: null, capped: false, note: null,
    });
  });
});

describe('buildBlockMovementLogs', () => {
  it('AMRAP 5 rounds + 22 reps splits across movements in order, at the prescribed weight', () => {
    const logs = buildBlockMovementLogs(amrap, exercises, { score_type: 'amrap', rounds: 5, reps: 22 });
    expect(logs.map((l) => l.exerciseIndex)).toEqual([1, 2, 3, 4]);
    expect(logs.map((l) => l.data.actualReps)).toEqual([60, 72, 75, 40]);
    expect(logs.every((l) => l.setIndex === 0 && l.data.completed === true)).toBe(true);
    expect(logs[0].data).toMatchObject({ exerciseName: 'Hang Power Cleans', actualWeight: 95, prescribedWeight: 95, prescribedReps: '10/rd' });
    expect(logs[1].data.actualWeight).toBeNull();
  });

  it('For Time logs completed movements with no rep counts', () => {
    const logs = buildBlockMovementLogs(forTime, exercises, { score_type: 'for_time', time_seconds: 702, capped: false });
    expect(logs).toHaveLength(1);
    expect(logs[0].data.actualReps).toBeNull();
    expect(logs[0].data.completed).toBe(true);
  });

  it('skips indexes that point past the exercise list', () => {
    const logs = buildBlockMovementLogs({ ...amrap, exercise_indexes: [4, 9] }, exercises, { score_type: 'amrap', rounds: 1, reps: 0 });
    expect(logs.map((l) => l.exerciseIndex)).toEqual([4]);
  });
});

describe('score indexing and display', () => {
  it('indexes rows by day and block', () => {
    const rows = [{ day_name: 'Saturday', block_id: 'forge', rounds: 5 }];
    expect(indexBlockScores(rows)[blockScoreKey('Saturday', 'forge')]).toBe(rows[0]);
    expect(indexBlockScores(null)).toEqual({});
  });

  it('words the number to beat from the earlier week', () => {
    const previous = { score_type: 'amrap', rounds: 5, reps: 22, week_number: 37 };
    expect(numberToBeatLabel(previous)).toBe('Number to beat: 5 rounds + 22 reps (Week 37)');
  });

  it('flags a new best only when strictly better', () => {
    const previous = { score_type: 'amrap', rounds: 5, reps: 22 };
    expect(isNewBest({ score_type: 'amrap', rounds: 6, reps: 0 }, previous)).toBe(true);
    expect(isNewBest({ score_type: 'amrap', rounds: 5, reps: 22 }, previous)).toBe(false);
    expect(isNewBest({ score_type: 'amrap', rounds: 4, reps: 40 }, previous)).toBe(false);
    expect(isNewBest({ score_type: 'amrap', rounds: 6 }, null)).toBe(false);
    expect(isNewBest(null, previous)).toBe(false);
  });
});

describe('dayHasLoggedSet', () => {
  it('is true once any set of any exercise is logged', () => {
    const logged = new Set(['1-0']);
    const isLogged = (e, s) => logged.has(`${e}-${s}`);
    expect(dayHasLoggedSet(exercises, isLogged)).toBe(true);
    expect(dayHasLoggedSet(exercises, () => false)).toBe(false);
    expect(dayHasLoggedSet(undefined, () => true)).toBe(false);
  });
});

describe('getCoachNotes', () => {
  it('returns trimmed text and null for anything else', () => {
    expect(getCoachNotes({ coach_notes: '  Warm up 5 min.\nThen cleans.  ' })).toBe('Warm up 5 min.\nThen cleans.');
    expect(getCoachNotes({ coach_notes: '   ' })).toBeNull();
    expect(getCoachNotes({ coach_notes: 42 })).toBeNull();
    expect(getCoachNotes({})).toBeNull();
    expect(getCoachNotes(undefined)).toBeNull();
  });
});
