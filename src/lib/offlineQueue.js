/**
 * Offline write queue for gym-wifi reality.
 *
 * Last write per idempotency key wins (toggle a set twice → one queued op).
 * Network failures stay queued. Hard DB errors are dropped so they cannot
 * block later sets.
 */
import { getItem, setItem } from '../utils/storage';

export const QUEUE_STORAGE_KEY = 'swoltracker-offline-queue';

export const WRITE_TYPES = {
  LOG_SET: 'logSet',
  MARK_COMPLETE: 'markComplete',
  UNMARK_COMPLETE: 'unmarkComplete',
  LOG_MISSED: 'logMissed',
  CLEAR_MISSED: 'clearMissed',
};

export function writeKey(type, payload) {
  const { userId, gymId, week, day } = payload;
  if (type === WRITE_TYPES.LOG_SET) {
    return `logSet:${userId}:${gymId}:${week}:${day}:${payload.exerciseIndex}:${payload.setIndex}`;
  }
  if (type === WRITE_TYPES.MARK_COMPLETE || type === WRITE_TYPES.UNMARK_COMPLETE) {
    return `complete:${userId}:${gymId}:${week}:${day}`;
  }
  if (type === WRITE_TYPES.LOG_MISSED || type === WRITE_TYPES.CLEAR_MISSED) {
    return `missed:${userId}:${gymId}:${week}:${day}`;
  }
  return `${type}:${userId}:${gymId}:${week}:${day}`;
}

export function mergeQueuedWrite(queue, write) {
  const key = write.key || writeKey(write.type, write.payload);
  const item = { ...write, key, id: write.id || key };
  return [...queue.filter((existing) => existing.key !== key), item];
}

export function isNetworkError(error) {
  if (!error) return false;
  const msg = String(error.message || error).toLowerCase();
  if (error.name === 'AbortError') return true;
  return (
    msg.includes('failed to fetch')
    || msg.includes('network')
    || msg.includes('offline')
    || msg.includes('load failed')
    || msg.includes('fetch')
  );
}

export function decideWriteOutcome({ online, result, error }) {
  if (result) return 'ack';
  if (online === false) return 'queue';
  if (isNetworkError(error)) return 'queue';
  return 'fail';
}

export function isBrowserOnline(nav = typeof navigator === 'undefined' ? { onLine: true } : navigator) {
  return nav.onLine !== false;
}

export function loadQueue() {
  const stored = getItem(QUEUE_STORAGE_KEY);
  return Array.isArray(stored) ? stored : [];
}

export function saveQueue(queue) {
  setItem(QUEUE_STORAGE_KEY, queue);
  emitQueueChanged(Array.isArray(queue) ? queue.length : 0);
  return queue;
}

export function enqueueWrite(write) {
  const next = mergeQueuedWrite(loadQueue(), {
    ...write,
    createdAt: write.createdAt ?? Date.now(),
  });
  return saveQueue(next);
}

export function queueLength() {
  return loadQueue().length;
}

const QUEUE_EVENT = 'swol-offline-queue';

function emitQueueChanged(count) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(QUEUE_EVENT, { detail: { count } }));
}

export function subscribeQueue(listener) {
  if (typeof window === 'undefined') return () => {};
  const handler = (event) => listener(event.detail?.count ?? queueLength());
  window.addEventListener(QUEUE_EVENT, handler);
  return () => window.removeEventListener(QUEUE_EVENT, handler);
}

export async function flushQueue(queue, { execute, isOnline }) {
  const flushed = [];
  const failed = [];
  const remaining = [];

  for (let i = 0; i < queue.length; i += 1) {
    const item = queue[i];
    if (!isOnline()) {
      remaining.push(...queue.slice(i));
      break;
    }

    try {
      const result = await execute(item);
      if (result) {
        flushed.push(item);
      } else if (!isOnline() || isNetworkError(result)) {
        remaining.push(...queue.slice(i));
        break;
      } else {
        failed.push(item);
      }
    } catch (error) {
      if (!isOnline() || isNetworkError(error)) {
        remaining.push(...queue.slice(i));
        break;
      }
      failed.push(item);
    }
  }

  return { remaining, flushed, failed };
}
