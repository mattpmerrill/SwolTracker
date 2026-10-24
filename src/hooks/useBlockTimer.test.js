import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '../test/hookHarness.js';
import { useBlockTimer } from './useBlockTimer';
import { TIMER_STATUS } from '../utils/blockTimer';
import { blockTimerKey } from '../utils/blockTimerStorage';
import { signalRestComplete } from '../utils/restCue';

vi.mock('react', async () => (await import('../test/hookHarness.js')).fakeReact);
vi.mock('../utils/restCue', () => ({
  signalRestComplete: vi.fn(),
  unlockRestAudio: vi.fn(),
}));

const T0 = new Date('2026-10-24T15:00:00Z').getTime();
const KEY = blockTimerKey({ userId: 'u1', week: 2, day: 'Friday', blockId: 'amrap' });
const OTHER_KEY = blockTimerKey({ userId: 'u1', week: 2, day: 'Friday', blockId: 'other' });

let store;
let listeners;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  vi.clearAllMocks();
  store = new Map();
  listeners = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
  });
  vi.stubGlobal('document', {
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: (type) => listeners.delete(type),
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useBlockTimer persistence', () => {
  it('a running timer survives unmount + remount with the right time after a lock', () => {
    const first = renderHook(() => useBlockTimer(12, KEY));
    first.result.current.start();
    vi.advanceTimersByTime(30_000);
    expect(first.result.current.secondsLeft).toBe(12 * 60 - 30);

    // The app is torn down (the loading-screen unmount, or an iOS eviction)...
    first.unmount();
    // ...and the phone stays locked for 4 more minutes.
    vi.setSystemTime(T0 + 30_000 + 4 * 60_000);

    const second = renderHook(() => useBlockTimer(12, KEY));
    expect(second.result.current.status).toBe(TIMER_STATUS.RUNNING);
    expect(second.result.current.secondsLeft).toBe(12 * 60 - 30 - 4 * 60);
    second.unmount();
  });

  it('keeps counting after the restore', () => {
    const first = renderHook(() => useBlockTimer(12, KEY));
    first.result.current.start();
    first.unmount();

    const second = renderHook(() => useBlockTimer(12, KEY));
    vi.advanceTimersByTime(10_000);
    expect(second.result.current.secondsLeft).toBe(12 * 60 - 10);
    second.unmount();
  });

  it('shows finished at 0:00 and cues exactly once across repeated remounts', () => {
    const first = renderHook(() => useBlockTimer(12, KEY));
    first.result.current.start();
    first.unmount();
    vi.setSystemTime(T0 + 20 * 60_000);

    const second = renderHook(() => useBlockTimer(12, KEY));
    expect(second.result.current.status).toBe(TIMER_STATUS.FINISHED);
    expect(second.result.current.secondsLeft).toBe(0);
    expect(signalRestComplete).toHaveBeenCalledTimes(1);
    second.unmount();

    for (let i = 0; i < 3; i += 1) {
      const again = renderHook(() => useBlockTimer(12, KEY));
      expect(again.result.current.status).toBe(TIMER_STATUS.FINISHED);
      again.unmount();
    }
    expect(signalRestComplete).toHaveBeenCalledTimes(1);
  });

  it('cues once when the timer finishes while mounted, and not again on remount', () => {
    const first = renderHook(() => useBlockTimer(1, KEY));
    first.result.current.start();
    vi.advanceTimersByTime(61_000);
    expect(first.result.current.status).toBe(TIMER_STATUS.FINISHED);
    expect(signalRestComplete).toHaveBeenCalledTimes(1);
    first.unmount();

    const second = renderHook(() => useBlockTimer(1, KEY));
    expect(second.result.current.status).toBe(TIMER_STATUS.FINISHED);
    expect(signalRestComplete).toHaveBeenCalledTimes(1);
    second.unmount();
  });

  it('recomputes when the page becomes visible again', () => {
    const view = renderHook(() => useBlockTimer(12, KEY));
    view.result.current.start();
    // The OS froze our interval; only the clock moved.
    vi.setSystemTime(T0 + 3 * 60_000);
    listeners.get('visibilitychange')();
    expect(view.result.current.secondsLeft).toBe(9 * 60);
    view.unmount();
  });

  it('reset clears storage and the next mount is idle', () => {
    const first = renderHook(() => useBlockTimer(12, KEY));
    first.result.current.start();
    expect(store.has(KEY)).toBe(true);
    first.result.current.reset();
    expect(first.result.current.status).toBe(TIMER_STATUS.IDLE);
    expect(store.has(KEY)).toBe(false);
    first.unmount();

    const second = renderHook(() => useBlockTimer(12, KEY));
    expect(second.result.current.status).toBe(TIMER_STATUS.IDLE);
    expect(second.result.current.secondsLeft).toBe(12 * 60);
    second.unmount();
  });

  it('starting again after a finished run cues again for the new run', () => {
    const view = renderHook(() => useBlockTimer(1, KEY));
    view.result.current.start();
    vi.advanceTimersByTime(61_000);
    expect(signalRestComplete).toHaveBeenCalledTimes(1);
    view.result.current.reset();
    view.result.current.start();
    vi.advanceTimersByTime(61_000);
    expect(signalRestComplete).toHaveBeenCalledTimes(2);
    view.unmount();
  });

  it('does not restore into a different block or a changed cap', () => {
    const first = renderHook(() => useBlockTimer(12, KEY));
    first.result.current.start();
    first.unmount();

    const otherBlock = renderHook(() => useBlockTimer(12, OTHER_KEY));
    expect(otherBlock.result.current.status).toBe(TIMER_STATUS.IDLE);
    otherBlock.unmount();

    const newCap = renderHook(() => useBlockTimer(10, KEY));
    expect(newCap.result.current.status).toBe(TIMER_STATUS.IDLE);
    expect(newCap.result.current.secondsLeft).toBe(10 * 60);
    newCap.unmount();
  });

  it('swaps to the other block timer when the key changes on the same instance', () => {
    const view = renderHook((props) => useBlockTimer(12, props.key), { key: KEY });
    view.result.current.start();
    view.rerender({ key: OTHER_KEY });
    expect(view.result.current.status).toBe(TIMER_STATUS.IDLE);
    expect(store.has(KEY)).toBe(true);
    view.rerender({ key: KEY });
    expect(view.result.current.status).toBe(TIMER_STATUS.RUNNING);
    view.unmount();
  });

  it('works without a storage key (nothing persisted)', () => {
    const view = renderHook(() => useBlockTimer(12));
    view.result.current.start();
    expect(view.result.current.status).toBe(TIMER_STATUS.RUNNING);
    expect(store.size).toBe(0);
    view.unmount();
  });
});
