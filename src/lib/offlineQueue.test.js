import { describe, expect, it } from 'vitest';
import {
  WRITE_TYPES,
  decideWriteOutcome,
  flushQueue,
  isNetworkError,
  mergeQueuedWrite,
  writeKey,
} from './offlineQueue';

describe('writeKey', () => {
  it('collapses logSet writes for the same set', () => {
    const payload = {
      userId: 'u1', gymId: 'g1', week: 29, day: 'Wednesday',
      exerciseIndex: 0, setIndex: 2,
    };
    expect(writeKey(WRITE_TYPES.LOG_SET, payload)).toBe('logSet:u1:g1:29:Wednesday:0:2');
  });

  it('uses one key for complete and uncomplete of the same day', () => {
    const payload = { userId: 'u1', gymId: 'g1', week: 29, day: 'Wednesday' };
    expect(writeKey(WRITE_TYPES.MARK_COMPLETE, payload)).toBe(
      writeKey(WRITE_TYPES.UNMARK_COMPLETE, payload),
    );
  });

  it('uses one key for miss and clear-miss of the same day', () => {
    const payload = { userId: 'u1', gymId: 'g1', week: 29, day: 'Wednesday' };
    expect(writeKey(WRITE_TYPES.LOG_MISSED, payload)).toBe(
      writeKey(WRITE_TYPES.CLEAR_MISSED, payload),
    );
  });
});

describe('mergeQueuedWrite', () => {
  it('replaces an older write with the same key and keeps others', () => {
    const first = {
      type: WRITE_TYPES.LOG_SET,
      payload: { userId: 'u1', gymId: 'g1', week: 1, day: 'Monday', exerciseIndex: 0, setIndex: 0, entry: { completed: true } },
      createdAt: 1,
    };
    const other = {
      type: WRITE_TYPES.LOG_SET,
      payload: { userId: 'u1', gymId: 'g1', week: 1, day: 'Monday', exerciseIndex: 0, setIndex: 1, entry: { completed: true } },
      createdAt: 2,
    };
    const update = {
      type: WRITE_TYPES.LOG_SET,
      payload: { userId: 'u1', gymId: 'g1', week: 1, day: 'Monday', exerciseIndex: 0, setIndex: 0, entry: { completed: false } },
      createdAt: 3,
    };

    const queued = mergeQueuedWrite(mergeQueuedWrite([], first), other);
    const next = mergeQueuedWrite(queued, update);

    expect(next).toHaveLength(2);
    const set0 = next.find((w) => w.payload.setIndex === 0);
    expect(set0.payload.entry.completed).toBe(false);
    expect(set0.createdAt).toBe(3);
  });
});

describe('decideWriteOutcome', () => {
  it('acks a successful write', () => {
    expect(decideWriteOutcome({ online: true, result: { id: '1' }, error: null })).toBe('ack');
  });

  it('queues when the browser is offline', () => {
    expect(decideWriteOutcome({ online: false, result: null, error: null })).toBe('queue');
  });

  it('queues a network error even if onLine is still true', () => {
    expect(decideWriteOutcome({
      online: true,
      result: null,
      error: new TypeError('Failed to fetch'),
    })).toBe('queue');
  });

  it('fails a real database miss while online', () => {
    expect(decideWriteOutcome({
      online: true,
      result: null,
      error: { message: 'duplicate key value' },
    })).toBe('fail');
  });
});

describe('isNetworkError', () => {
  it('detects fetch failures', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true);
    expect(isNetworkError({ message: 'Load failed' })).toBe(true);
    expect(isNetworkError({ message: 'duplicate key' })).toBe(false);
    expect(isNetworkError(null)).toBe(false);
  });
});

describe('flushQueue', () => {
  it('removes writes that execute successfully', async () => {
    const queue = mergeQueuedWrite([], {
      type: WRITE_TYPES.LOG_SET,
      payload: { userId: 'u1', gymId: 'g1', week: 1, day: 'Monday', exerciseIndex: 0, setIndex: 0 },
      createdAt: 1,
    });

    const result = await flushQueue(queue, {
      execute: async () => ({ id: 'ok' }),
      isOnline: () => true,
    });

    expect(result.flushed).toHaveLength(1);
    expect(result.remaining).toEqual([]);
    expect(result.failed).toEqual([]);
  });

  it('stops and keeps the rest when the network drops mid-flush', async () => {
    const a = {
      type: WRITE_TYPES.LOG_SET,
      payload: { userId: 'u1', gymId: 'g1', week: 1, day: 'Monday', exerciseIndex: 0, setIndex: 0 },
      createdAt: 1,
    };
    const b = {
      type: WRITE_TYPES.LOG_SET,
      payload: { userId: 'u1', gymId: 'g1', week: 1, day: 'Monday', exerciseIndex: 0, setIndex: 1 },
      createdAt: 2,
    };
    const queue = mergeQueuedWrite(mergeQueuedWrite([], a), b);
    let calls = 0;

    const result = await flushQueue(queue, {
      execute: async () => {
        calls += 1;
        if (calls === 1) return { id: 'ok' };
        throw new TypeError('Failed to fetch');
      },
      isOnline: () => true,
    });

    expect(result.flushed).toHaveLength(1);
    expect(result.remaining).toHaveLength(1);
    expect(result.remaining[0].payload.setIndex).toBe(1);
  });

  it('drops a hard failure so a bad row cannot block the queue', async () => {
    const queue = mergeQueuedWrite([], {
      type: WRITE_TYPES.LOG_SET,
      payload: { userId: 'u1', gymId: 'g1', week: 1, day: 'Monday', exerciseIndex: 0, setIndex: 0 },
      createdAt: 1,
    });

    const result = await flushQueue(queue, {
      execute: async () => null,
      isOnline: () => true,
    });

    expect(result.failed).toHaveLength(1);
    expect(result.remaining).toEqual([]);
  });
});
