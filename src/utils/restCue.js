/**
 * Rest-timer helpers: duration from prescribed reps, plus a pocket-audible cue.
 * Audio is unlocked on the log tap (user gesture) so the beep can fire at 0.
 */

let audioCtx = null;

export function getRestSeconds(reps) {
  if (reps == null) return 60;
  const text = String(reps).trim();
  const m = text.match(/^(\d{1,3})(?:\s*(?:reps?|s|sec|seconds?))?$/i);
  if (!m) return 60;
  const r = parseInt(m[1], 10);
  if (!Number.isFinite(r) || r <= 0) return 60;
  if (r <= 3) return 180;
  if (r <= 6) return 150;
  if (r <= 10) return 90;
  return 60;
}

export function unlockRestAudio() {
  if (typeof window === 'undefined') return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) audioCtx = new Ctx();
  audioCtx.resume?.();
  return audioCtx;
}

function playRestBeep() {
  const ctx = unlockRestAudio();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = 880;
  gain.gain.setValueAtTime(0.18, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.4);
}

/** Vibrate + short beep when rest hits zero. Safe to call without a window. */
export function signalRestComplete() {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate([180, 80, 180, 80, 240]);
    } catch {
      // ignore — some browsers throw if vibration is blocked
    }
  }
  try {
    playRestBeep();
  } catch {
    // ignore — autoplay policy or missing AudioContext
  }
}
