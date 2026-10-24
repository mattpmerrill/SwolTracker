import { TIMER_STATUS, createTimer, syncTimer } from './blockTimer';

/**
 * Persistence for the block countdown. The timer is timestamp-based
 * ({status, totalMs, elapsedMs, startedAt}), so a saved running timer is still
 * correct after the app was backgrounded, remounted or fully reloaded by the
 * OS: remaining time is recomputed from `startedAt` when it is restored.
 * Storage is best effort; private mode or a full quota just means no restore.
 */

const KEY_PREFIX = 'swoltracker-blocktimer:';
const ENTRY_VERSION = 1;
/** A saved timer older than this belongs to a different session. */
export const BLOCK_TIMER_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const PERSISTED_STATUSES = new Set([TIMER_STATUS.RUNNING, TIMER_STATUS.PAUSED, TIMER_STATUS.FINISHED]);

function defaultStorage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // Reading `localStorage` itself can throw when storage is blocked.
    return null;
  }
}

/** Stable identity of one block instance, or null when any part is missing. */
export function blockTimerKey({ userId, week, day, blockId }) {
  if (week == null || !day || blockId == null || blockId === '') return null;
  return `${KEY_PREFIX}${userId ?? 'anon'}:${week}-${day}-${blockId}`;
}

export function clearBlockTimer(key, storage = defaultStorage()) {
  if (!key || !storage) return;
  try {
    storage.removeItem(key);
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}

/**
 * Saves a timer. An idle timer is the default state, so it removes the entry
 * instead. `cued` records that the finish cue already fired for this run.
 */
export function saveBlockTimer(key, timer, { cued = false, now = Date.now(), storage = defaultStorage() } = {}) {
  if (!key || !storage) return;
  if (!PERSISTED_STATUSES.has(timer.status)) {
    clearBlockTimer(key, storage);
    return;
  }
  const entry = {
    v: ENTRY_VERSION,
    status: timer.status,
    totalMs: timer.totalMs,
    elapsedMs: timer.elapsedMs,
    startedAt: timer.startedAt,
    cued: Boolean(cued),
    savedAt: now,
  };
  try {
    storage.setItem(key, JSON.stringify(entry));
  } catch {
    // Private mode or quota: the timer still works, it just will not survive a reload.
  }
}

function validEntry(entry, totalMs, now) {
  if (!entry || typeof entry !== 'object' || entry.v !== ENTRY_VERSION) return false;
  if (!PERSISTED_STATUSES.has(entry.status)) return false;
  // A changed time cap means the block was edited: start fresh.
  if (entry.totalMs !== totalMs) return false;
  if (!Number.isFinite(entry.elapsedMs) || entry.elapsedMs < 0 || entry.elapsedMs > totalMs) return false;
  if (!Number.isFinite(entry.savedAt) || now - entry.savedAt > BLOCK_TIMER_MAX_AGE_MS) return false;
  if (entry.status === TIMER_STATUS.RUNNING && !Number.isFinite(entry.startedAt)) return false;
  return true;
}

/**
 * The timer to show for this block right now: restored if a valid saved one
 * exists (a running timer whose cap passed while away comes back finished),
 * otherwise a fresh idle timer. Bad or stale entries are removed.
 * Returns { timer, cued }.
 */
export function restoreBlockTimer(key, capMinutes, { now = Date.now(), storage = defaultStorage() } = {}) {
  const fresh = createTimer(capMinutes);
  if (!key || !storage) return { timer: fresh, cued: false };

  let entry;
  try {
    const raw = storage.getItem(key);
    if (raw == null) return { timer: fresh, cued: false };
    entry = JSON.parse(raw);
  } catch {
    entry = null;
  }

  if (fresh.totalMs <= 0 || !validEntry(entry, fresh.totalMs, now)) {
    clearBlockTimer(key, storage);
    return { timer: fresh, cued: false };
  }

  const timer = syncTimer(
    {
      status: entry.status,
      totalMs: entry.totalMs,
      elapsedMs: entry.elapsedMs,
      startedAt: entry.status === TIMER_STATUS.RUNNING ? entry.startedAt : null,
    },
    now,
  );
  return { timer, cued: timer.status === TIMER_STATUS.FINISHED && entry.cued === true };
}
