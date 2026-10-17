import { useCallback, useEffect, useState } from 'react';
import {
  TIMER_STATUS,
  createTimer,
  startTimer,
  pauseTimer,
  resetTimer,
  syncTimer,
  remainingSeconds,
  timerProgress,
} from '../utils/blockTimer';
import { signalRestComplete, unlockRestAudio } from '../utils/restCue';

const TICK_MS = 250;

/**
 * React wrapper over the pure countdown in utils/blockTimer. The interval only
 * refreshes `now`; elapsed time comes from timestamps, so a locked phone that
 * throttles the tab still shows the right time when it wakes.
 */
export function useBlockTimer(capMinutes) {
  const [timer, setTimer] = useState(() => createTimer(capMinutes));
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setTimer(createTimer(capMinutes));
  }, [capMinutes]);

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
  }, [status]);

  useEffect(() => {
    if (status === TIMER_STATUS.FINISHED) signalRestComplete();
  }, [status]);

  const start = useCallback(() => {
    // Audio can only be unlocked inside a tap, and the cue fires minutes later.
    unlockRestAudio();
    const at = Date.now();
    setNow(at);
    setTimer((prev) => startTimer(prev, at));
  }, []);

  const pause = useCallback(() => {
    const at = Date.now();
    setNow(at);
    setTimer((prev) => pauseTimer(prev, at));
  }, []);

  const reset = useCallback(() => {
    setNow(Date.now());
    setTimer((prev) => resetTimer(prev));
  }, []);

  return {
    status,
    secondsLeft: remainingSeconds(timer, now),
    progress: timerProgress(timer, now),
    start,
    pause,
    reset,
  };
}
