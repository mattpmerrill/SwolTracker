import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '../test/hookHarness.js';
import { useRestCountdown } from './useRestCountdown';
import { restSecondsLeft, signalRestComplete } from '../utils/restCue';

vi.mock('react', async () => (await import('../test/hookHarness.js')).fakeReact);
vi.mock('../utils/restCue', async (importOriginal) => ({
  ...(await importOriginal()),
  signalRestComplete: vi.fn(),
}));

const T0 = new Date('2026-10-24T15:00:00Z').getTime();
let listeners;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  vi.clearAllMocks();
  listeners = new Map();
  vi.stubGlobal('document', {
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: (type) => listeners.delete(type),
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('restSecondsLeft', () => {
  it('rounds up and never goes negative', () => {
    expect(restSecondsLeft(T0 + 90_000, T0)).toBe(90);
    expect(restSecondsLeft(T0 + 89_001, T0)).toBe(90);
    expect(restSecondsLeft(T0 + 1, T0)).toBe(1);
    expect(restSecondsLeft(T0, T0)).toBe(0);
    expect(restSecondsLeft(T0, T0 + 5000)).toBe(0);
  });
});

describe('useRestCountdown', () => {
  it('counts down from the clock', () => {
    const onDismiss = vi.fn();
    const view = renderHook(() => useRestCountdown(90, onDismiss));
    expect(view.result.current).toBe(90);
    vi.advanceTimersByTime(10_000);
    expect(view.result.current).toBe(80);
    view.unmount();
  });

  it('shows the right time after the page was frozen (visibilitychange)', () => {
    const view = renderHook(() => useRestCountdown(90, vi.fn()));
    // No interval ticks ran while locked; only the wall clock moved.
    vi.setSystemTime(T0 + 45_000);
    listeners.get('visibilitychange')();
    expect(view.result.current).toBe(45);
    view.unmount();
  });

  it('cues once at zero and dismisses ~600ms later', () => {
    const onDismiss = vi.fn();
    const view = renderHook(() => useRestCountdown(5, onDismiss));
    vi.advanceTimersByTime(5_000);
    expect(view.result.current).toBe(0);
    expect(signalRestComplete).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(599);
    expect(onDismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(10_000);
    expect(signalRestComplete).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it('finishes straight away if the phone was locked past the end', () => {
    const onDismiss = vi.fn();
    const view = renderHook(() => useRestCountdown(60, onDismiss));
    vi.setSystemTime(T0 + 10 * 60_000);
    listeners.get('visibilitychange')();
    listeners.get('visibilitychange')();
    expect(view.result.current).toBe(0);
    expect(signalRestComplete).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(600);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it('does not restart or drift when the parent re-renders with a new callback', () => {
    const view = renderHook((props) => useRestCountdown(90, props.onDismiss), { onDismiss: vi.fn() });
    vi.advanceTimersByTime(20_000);
    view.rerender({ onDismiss: vi.fn() });
    vi.advanceTimersByTime(20_000);
    expect(view.result.current).toBe(50);
    view.unmount();
  });

  it('stops everything on unmount (manual dismiss)', () => {
    const onDismiss = vi.fn();
    const view = renderHook(() => useRestCountdown(2, onDismiss));
    vi.advanceTimersByTime(2_000);
    view.unmount();
    vi.advanceTimersByTime(5_000);
    expect(onDismiss).not.toHaveBeenCalled();
    expect(listeners.has('visibilitychange')).toBe(false);
  });
});
