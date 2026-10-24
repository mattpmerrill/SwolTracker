import { describe, it, expect } from 'vitest';
import { TIMER_STATUS, createTimer, startTimer, pauseTimer, remainingSeconds } from './blockTimer';
import {
  BLOCK_TIMER_MAX_AGE_MS,
  blockTimerKey,
  clearBlockTimer,
  restoreBlockTimer,
  saveBlockTimer,
} from './blockTimerStorage';

const T0 = 1_700_000_000_000;
const KEY = blockTimerKey({ userId: 'u1', week: 3, day: 'Monday', blockId: 'b1' });

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => { data.set(k, String(v)); },
    removeItem: (k) => { data.delete(k); },
    has: (k) => data.has(k),
  };
}

const throwingStorage = {
  getItem: () => { throw new Error('denied'); },
  setItem: () => { throw new Error('quota'); },
  removeItem: () => { throw new Error('denied'); },
};

describe('blockTimerKey', () => {
  it('is stable per user, week, day and block', () => {
    expect(KEY).toBe('swoltracker-blocktimer:u1:3-Monday-b1');
    expect(blockTimerKey({ userId: 'u1', week: 3, day: 'Monday', blockId: 'b2' })).not.toBe(KEY);
    expect(blockTimerKey({ userId: 'u2', week: 3, day: 'Monday', blockId: 'b1' })).not.toBe(KEY);
  });

  it('is null when the block cannot be identified', () => {
    expect(blockTimerKey({ userId: 'u1', week: null, day: 'Monday', blockId: 'b1' })).toBeNull();
    expect(blockTimerKey({ userId: 'u1', week: 3, day: '', blockId: 'b1' })).toBeNull();
    expect(blockTimerKey({ userId: 'u1', week: 3, day: 'Monday', blockId: undefined })).toBeNull();
  });
});

describe('save / restore round trip', () => {
  it('restores a running timer with the remaining time recomputed from the clock', () => {
    const storage = memoryStorage();
    const running = startTimer(createTimer(12), T0);
    saveBlockTimer(KEY, running, { now: T0, storage });

    // Phone locked for 5 minutes, then the app remounts.
    const { timer } = restoreBlockTimer(KEY, 12, { now: T0 + 5 * 60_000, storage });
    expect(timer.status).toBe(TIMER_STATUS.RUNNING);
    expect(remainingSeconds(timer, T0 + 5 * 60_000)).toBe(7 * 60);
  });

  it('restores a paused timer exactly', () => {
    const storage = memoryStorage();
    const paused = pauseTimer(startTimer(createTimer(12), T0), T0 + 90_000);
    saveBlockTimer(KEY, paused, { now: T0 + 90_000, storage });

    const { timer } = restoreBlockTimer(KEY, 12, { now: T0 + 3_600_000, storage });
    expect(timer.status).toBe(TIMER_STATUS.PAUSED);
    expect(remainingSeconds(timer, T0 + 3_600_000)).toBe(12 * 60 - 90);
  });

  it('restores a running timer whose cap passed while away as finished at 0:00', () => {
    const storage = memoryStorage();
    saveBlockTimer(KEY, startTimer(createTimer(12), T0), { now: T0, storage });

    const later = T0 + 20 * 60_000;
    const { timer, cued } = restoreBlockTimer(KEY, 12, { now: later, storage });
    expect(timer.status).toBe(TIMER_STATUS.FINISHED);
    expect(remainingSeconds(timer, later)).toBe(0);
    expect(cued).toBe(false);
  });

  it('remembers that the finish cue already fired for the run', () => {
    const storage = memoryStorage();
    const finished = { ...createTimer(12), status: TIMER_STATUS.FINISHED, elapsedMs: 12 * 60_000 };
    saveBlockTimer(KEY, finished, { cued: true, now: T0, storage });

    const { timer, cued } = restoreBlockTimer(KEY, 12, { now: T0 + 1000, storage });
    expect(timer.status).toBe(TIMER_STATUS.FINISHED);
    expect(cued).toBe(true);
  });

  it('returns a fresh idle timer when nothing is stored', () => {
    const { timer, cued } = restoreBlockTimer(KEY, 12, { now: T0, storage: memoryStorage() });
    expect(timer).toEqual(createTimer(12));
    expect(cued).toBe(false);
  });
});

describe('clearing', () => {
  it('clearBlockTimer removes the entry', () => {
    const storage = memoryStorage();
    saveBlockTimer(KEY, startTimer(createTimer(12), T0), { now: T0, storage });
    expect(storage.has(KEY)).toBe(true);
    clearBlockTimer(KEY, storage);
    expect(storage.has(KEY)).toBe(false);
  });

  it('saving an idle timer (reset) removes the entry', () => {
    const storage = memoryStorage();
    saveBlockTimer(KEY, startTimer(createTimer(12), T0), { now: T0, storage });
    saveBlockTimer(KEY, createTimer(12), { now: T0 + 1, storage });
    expect(storage.has(KEY)).toBe(false);
  });
});

describe('malformed and stale entries', () => {
  const valid = {
    v: 1, status: 'running', totalMs: 720_000, elapsedMs: 0, startedAt: T0, cued: false, savedAt: T0,
  };

  const cases = {
    'invalid JSON': 'not json{',
    'wrong version': JSON.stringify({ ...valid, v: 2 }),
    'unknown status': JSON.stringify({ ...valid, status: 'idle' }),
    'non-object': JSON.stringify(42),
    'negative elapsed': JSON.stringify({ ...valid, elapsedMs: -5 }),
    'elapsed beyond cap': JSON.stringify({ ...valid, elapsedMs: 999_999_999 }),
    'running without startedAt': JSON.stringify({ ...valid, startedAt: null }),
    'missing savedAt': JSON.stringify({ ...valid, savedAt: undefined }),
    'cap changed': JSON.stringify({ ...valid, totalMs: 600_000 }),
    'older than 24h': JSON.stringify({ ...valid, savedAt: T0 - BLOCK_TIMER_MAX_AGE_MS - 1 }),
  };

  for (const [name, raw] of Object.entries(cases)) {
    it(`discards ${name} and removes it`, () => {
      const storage = memoryStorage({ [KEY]: raw });
      const { timer } = restoreBlockTimer(KEY, 12, { now: T0 + 1000, storage });
      expect(timer).toEqual(createTimer(12));
      expect(storage.has(KEY)).toBe(false);
    });
  }

  it('keeps an entry just inside the 24h window', () => {
    const storage = memoryStorage({ [KEY]: JSON.stringify({ ...valid, savedAt: T0 }) });
    const { timer } = restoreBlockTimer(KEY, 12, { now: T0 + BLOCK_TIMER_MAX_AGE_MS, storage });
    expect(timer.status).toBe(TIMER_STATUS.FINISHED);
  });

  it('does not restore anything for a block with no time cap', () => {
    const storage = memoryStorage({ [KEY]: JSON.stringify({ ...valid, totalMs: 0 }) });
    const { timer } = restoreBlockTimer(KEY, null, { now: T0, storage });
    expect(timer.status).toBe(TIMER_STATUS.IDLE);
  });
});

describe('unavailable storage', () => {
  it('never throws when storage is blocked or missing', () => {
    expect(() => saveBlockTimer(KEY, startTimer(createTimer(12), T0), { now: T0, storage: throwingStorage })).not.toThrow();
    expect(() => clearBlockTimer(KEY, throwingStorage)).not.toThrow();
    expect(restoreBlockTimer(KEY, 12, { now: T0, storage: throwingStorage }).timer).toEqual(createTimer(12));
    expect(restoreBlockTimer(KEY, 12, { now: T0 }).timer).toEqual(createTimer(12));
  });

  it('does nothing without a key', () => {
    const storage = memoryStorage();
    saveBlockTimer(null, startTimer(createTimer(12), T0), { now: T0, storage });
    expect(restoreBlockTimer(null, 12, { now: T0, storage }).timer).toEqual(createTimer(12));
  });
});
