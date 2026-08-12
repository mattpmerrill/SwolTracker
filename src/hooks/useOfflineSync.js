import { useCallback, useEffect, useRef, useState } from 'react';
import {
  flushQueue,
  isBrowserOnline,
  loadQueue,
  queueLength,
  saveQueue,
  subscribeQueue,
} from '../lib/offlineQueue';
import { executeQueuedWrite } from '../lib/offlineWrites';

export function useOfflineSync({ toast } = {}) {
  const [pending, setPending] = useState(() => queueLength());
  const [online, setOnline] = useState(() => isBrowserOnline());
  const flushing = useRef(false);

  const flush = useCallback(async () => {
    if (flushing.current || !isBrowserOnline()) {
      setPending(queueLength());
      return;
    }
    flushing.current = true;
    try {
      const { remaining, flushed, failed } = await flushQueue(loadQueue(), {
        execute: executeQueuedWrite,
        isOnline: isBrowserOnline,
      });
      saveQueue(remaining);
      setPending(remaining.length);
      if (flushed.length > 0 && remaining.length === 0) {
        toast?.success?.('Synced your gym sets.');
      }
      if (failed.length > 0) {
        toast?.warning?.('Some sets could not sync. Check them when you have signal.');
      }
    } finally {
      flushing.current = false;
    }
  }, [toast]);

  useEffect(() => subscribeQueue((count) => setPending(count)), []);

  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      flush();
    };
    const onOffline = () => setOnline(false);
    const onVisible = () => {
      if (document.visibilityState === 'visible') flush();
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisible);
    flush();
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [flush]);

  return { pending, online, flush };
}
