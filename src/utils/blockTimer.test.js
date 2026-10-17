import { describe, it, expect } from 'vitest';
import {
  TIMER_STATUS,
  createTimer,
  startTimer,
  pauseTimer,
  resetTimer,
  syncTimer,
  remainingSeconds,
  timerProgress,
  formatClock,
} from './blockTimer';

const T0 = 1_000_000;

describe('formatClock', () => {
  it('pads seconds and leaves minutes uncapped', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(65)).toBe('1:05');
    expect(formatClock(12 * 60)).toBe('12:00');
    expect(formatClock(90 * 60)).toBe('90:00');
  });

  it('treats bad input as zero', () => {
    expect(formatClock(-4)).toBe('0:00');
    expect(formatClock(Number.NaN)).toBe('0:00');
    expect(formatClock(undefined)).toBe('0:00');
  });
});

describe('block timer', () => {
  it('starts idle at the full cap', () => {
    const timer = createTimer(12);
    expect(timer.status).toBe(TIMER_STATUS.IDLE);
    expect(remainingSeconds(timer, T0)).toBe(720);
    expect(timerProgress(timer, T0)).toBe(0);
  });

  it('counts down from the start timestamp, not from interval ticks', () => {
    const running = startTimer(createTimer(12), T0);
    expect(remainingSeconds(running, T0 + 90_000)).toBe(630);
    expect(remainingSeconds(running, T0 + 90_001)).toBe(630);
    expect(remainingSeconds(running, T0 + 90_000 + 1)).toBe(630);
  });

  it('rounds up so 0:00 appears only when time is up', () => {
    const running = startTimer(createTimer(1), T0);
    expect(remainingSeconds(running, T0 + 59_001)).toBe(1);
    expect(remainingSeconds(running, T0 + 60_000)).toBe(0);
  });

  it('pause freezes the clock and resume continues from there', () => {
    const paused = pauseTimer(startTimer(createTimer(10), T0), T0 + 120_000);
    expect(paused.status).toBe(TIMER_STATUS.PAUSED);
    expect(remainingSeconds(paused, T0 + 999_000)).toBe(480);

    const resumed = startTimer(paused, T0 + 500_000);
    expect(resumed.status).toBe(TIMER_STATUS.RUNNING);
    expect(remainingSeconds(resumed, T0 + 560_000)).toBe(420);
  });

  it('reset returns to idle at the full cap', () => {
    const reset = resetTimer(pauseTimer(startTimer(createTimer(5), T0), T0 + 60_000));
    expect(reset.status).toBe(TIMER_STATUS.IDLE);
    expect(remainingSeconds(reset, T0 + 60_000)).toBe(300);
  });

  it('finishes when the cap is reached and stays finished', () => {
    const running = startTimer(createTimer(1), T0);
    expect(syncTimer(running, T0 + 30_000)).toBe(running);

    const done = syncTimer(running, T0 + 61_000);
    expect(done.status).toBe(TIMER_STATUS.FINISHED);
    expect(remainingSeconds(done, T0 + 999_000)).toBe(0);
    expect(timerProgress(done, T0 + 999_000)).toBe(1);
    expect(startTimer(done, T0 + 2_000_000)).toBe(done);
  });

  it('does not let a clock set backwards add time back', () => {
    const running = startTimer(createTimer(10), T0);
    expect(remainingSeconds(running, T0 - 60_000)).toBe(600);
  });

  it('ignores pause when not running and start on a zero cap', () => {
    const idle = createTimer(10);
    expect(pauseTimer(idle, T0)).toBe(idle);
    const none = createTimer(0);
    expect(startTimer(none, T0)).toBe(none);
    expect(timerProgress(none, T0)).toBe(0);
  });
});
