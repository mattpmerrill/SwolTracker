import { describe, it, expect, beforeEach } from 'vitest';
import { getWeekSessionNotes, recordWeekSessionNote, weekSessionNotesKey } from './sessionNotes';

const memory = new Map();

beforeEach(() => {
  memory.clear();
  globalThis.localStorage = {
    getItem: (key) => (memory.has(key) ? memory.get(key) : null),
    setItem: (key, value) => { memory.set(key, String(value)); },
    removeItem: (key) => { memory.delete(key); },
  };
});

describe('sessionNotes', () => {
  it('records last note per day for a week', async () => {
    await recordWeekSessionNote(4, 'Monday', 'Felt strong', 'Felt strong');
    await recordWeekSessionNote(4, 'Monday', 'Energy was low', 'Low energy');
    await recordWeekSessionNote(4, 'Wednesday', 'Hit all prescribed work', 'Ready to push');
    expect(await getWeekSessionNotes(4)).toEqual([
      { day: 'Monday', text: 'Energy was low', label: 'Low energy' },
      { day: 'Wednesday', text: 'Hit all prescribed work', label: 'Ready to push' },
    ]);
    expect(weekSessionNotesKey(4)).toBe('swoltracker-week-session-notes:4');
  });

  it('ignores empty text', async () => {
    expect(await recordWeekSessionNote(1, 'Monday', '  ')).toEqual([]);
  });
});
