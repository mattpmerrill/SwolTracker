import { useEffect, useRef, useState } from 'react';
import { restSecondsLeft, signalRestComplete } from '../utils/restCue';

const TICK_MS = 250;
const DISMISS_DELAY_MS = 600;

/**
 * Timestamp-based rest countdown. The end time is fixed when the timer
 * mounts and `secondsLeft` is recomputed from the clock on every tick and when
 * the page becomes visible again, so a locked phone (which throttles or freezes
 * intervals) does not stall or drift the countdown.
 *
 * Cues once at zero, then calls `onDismiss` shortly after so 0:00 is seen.
 */
export function useRestCountdown(restSeconds, onDismiss) {
  const endAtRef = useRef(null);
  if (endAtRef.current === null) endAtRef.current = Date.now() + restSeconds * 1000;
  const [secondsLeft, setSecondsLeft] = useState(restSeconds);
  const cuedRef = useRef(false);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    let dismissId = null;
    let intervalId = null;

    const sync = () => {
      const left = restSecondsLeft(endAtRef.current, Date.now());
      setSecondsLeft(left);
      if (left > 0 || cuedRef.current) return;
      cuedRef.current = true;
      clearInterval(intervalId);
      signalRestComplete();
      dismissId = setTimeout(() => onDismissRef.current?.(), DISMISS_DELAY_MS);
    };

    intervalId = setInterval(sync, TICK_MS);
    document.addEventListener('visibilitychange', sync);
    return () => {
      clearInterval(intervalId);
      clearTimeout(dismissId);
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);

  return secondsLeft;
}
