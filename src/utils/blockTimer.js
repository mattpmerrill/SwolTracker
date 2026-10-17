/**
 * Countdown for a block's time cap. Pure and timestamp-based: the component
 * passes `now` in, so a throttled background tab (phone locked mid-AMRAP)
 * still shows the right time when it wakes, instead of drifting like a
 * counter that decrements once per interval tick.
 */

export const TIMER_STATUS = {
  IDLE: 'idle',
  RUNNING: 'running',
  PAUSED: 'paused',
  FINISHED: 'finished',
};

export function createTimer(capMinutes) {
  const minutes = Number.isFinite(capMinutes) && capMinutes > 0 ? capMinutes : 0;
  return { status: TIMER_STATUS.IDLE, totalMs: minutes * 60_000, elapsedMs: 0, startedAt: null };
}

function elapsedAt(timer, now) {
  const running = timer.status === TIMER_STATUS.RUNNING && timer.startedAt != null
    // A clock set backwards must not add time back to the countdown.
    ? Math.max(0, now - timer.startedAt)
    : 0;
  return Math.min(timer.totalMs, timer.elapsedMs + running);
}

export function startTimer(timer, now) {
  if (timer.status === TIMER_STATUS.RUNNING || timer.status === TIMER_STATUS.FINISHED) return timer;
  if (timer.totalMs <= 0) return timer;
  return { ...timer, status: TIMER_STATUS.RUNNING, startedAt: now };
}

export function pauseTimer(timer, now) {
  if (timer.status !== TIMER_STATUS.RUNNING) return timer;
  return { ...timer, status: TIMER_STATUS.PAUSED, elapsedMs: elapsedAt(timer, now), startedAt: null };
}

export function resetTimer(timer) {
  return { ...timer, status: TIMER_STATUS.IDLE, elapsedMs: 0, startedAt: null };
}

/** Moves a running timer to `finished` once the cap is reached; otherwise returns the same object. */
export function syncTimer(timer, now) {
  if (timer.status !== TIMER_STATUS.RUNNING) return timer;
  if (elapsedAt(timer, now) < timer.totalMs) return timer;
  return { ...timer, status: TIMER_STATUS.FINISHED, elapsedMs: timer.totalMs, startedAt: null };
}

/** Whole seconds left, rounded up so the display reads 0:00 only when time is truly up. */
export function remainingSeconds(timer, now) {
  return Math.max(0, Math.ceil((timer.totalMs - elapsedAt(timer, now)) / 1000));
}

/** 0..1 of the cap used. */
export function timerProgress(timer, now) {
  if (timer.totalMs <= 0) return 0;
  return elapsedAt(timer, now) / timer.totalMs;
}

/** m:ss, with minutes uncapped so a 90-minute cap reads 90:00. */
export function formatClock(totalSeconds) {
  const safe = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}
