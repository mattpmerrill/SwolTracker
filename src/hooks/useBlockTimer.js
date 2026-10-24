import { useCallback, useEffect, useRef, useState } from 'react';
import {
  TIMER_STATUS,
  startTimer,
  pauseTimer,
  resetTimer,
  syncTimer,
  remainingSeconds,
  timerProgress,
} from '../utils/blockTimer';
import { clearBlockTimer, restoreBlockTimer, saveBlockTimer } from '../utils/blockTimerStorage';
import { signalRestComplete, unlockRestAudio } from '../utils/restCue';

const TICK_MS = 250;

/**
 * React wrapper over the pure countdown in utils/blockTimer. The interval only
 * refreshes `now`; elapsed time comes from timestamps, so a locked phone that
 * throttles the tab still shows the right time when it wakes.
 *
 * With a `storageKey` the timer is also saved to localStorage, so it survives
 * a remount or a full reload (iOS can evict a backgrounded home-screen app).
 * The finish cue fires at most once per run, even across restores.
 */
export function useBlockTimer(capMinutes, storageKey = null) {
  const identity = `${storageKey ?? ''}|${capMinutes}`;
  const cuedRef = useRef(false);
  const [state, setState] = useState(() => {
    const restored = restoreBlockTimer(storageKey, capMinutes);
    cuedRef.current = restored.cued;
    return { identity, timer: restored.timer };
  });
  const [now, setNow] = useState(() => Date.now());

  // A different block (or cap) gets its own timer: swap state during render.
  let timer = state.timer;
  if (state.identity !== identity) {
    const restored = restoreBlockTimer(storageKey, capMinutes);
    cuedRef.current = restored.cued;
    timer = restored.timer;
    setState({ identity, timer });
  }

  const setTimer = useCallback((update) => {
    setState((prev) => {
      const next = typeof update === 'function' ? update(prev.timer) : update;
      return next === prev.timer ? prev : { ...prev, timer: next };
    });
  }, []);

  const status = timer.status;

  useEffect(() => {
    if (status !== TIMER_STATUS.RUNNING) return undefined;
    const tick = () => {
      const at = Date.now();
      setNow(at);
      setTimer((prev) => syncTimer(prev, at));
    };
    const id = setInterval(tick, TICK_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [status, setTimer]);

  useEffect(() => {
    if (status === TIMER_STATUS.FINISHED && !cuedRef.current) {
      cuedRef.current = true;
      signalRestComplete();
    }
    saveBlockTimer(storageKey, timer, { cued: cuedRef.current });
  }, [storageKey, timer, status]);

  const start = useCallback(() => {
    // Audio can only be unlocked inside a tap, and the cue fires minutes later.
    unlockRestAudio();
    cuedRef.current = false;
    const at = Date.now();
    setNow(at);
    setTimer((prev) => startTimer(prev, at));
  }, [setTimer]);

  const pause = useCallback(() => {
    const at = Date.now();
    setNow(at);
    setTimer((prev) => pauseTimer(prev, at));
  }, [setTimer]);

  const reset = useCallback(() => {
    cuedRef.current = false;
    clearBlockTimer(storageKey);
    setNow(Date.now());
    setTimer((prev) => resetTimer(prev));
  }, [storageKey, setTimer]);

  return {
    status,
    secondsLeft: remainingSeconds(timer, now),
    progress: timerProgress(timer, now),
    start,
    pause,
    reset,
  };
}
