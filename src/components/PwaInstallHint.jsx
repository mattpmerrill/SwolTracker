import { useEffect, useState } from 'react';
import { Share, X } from 'lucide-react';
import { getItem, setItem } from '../utils/storage';

const DISMISS_KEY = 'swoltracker-pwa-hint-dismissed';

function isStandalone() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
}

function isAppleDevice() {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod|macintosh/i.test(navigator.userAgent)
    && 'ontouchend' in document;
}

export default function PwaInstallHint() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (isStandalone() || getItem(DISMISS_KEY)) return;
    if (!isAppleDevice() && !/android/i.test(navigator.userAgent || '')) return;
    const timer = setTimeout(() => setOpen(true), 2500);
    return () => clearTimeout(timer);
  }, []);

  if (!open) return null;

  const apple = isAppleDevice();

  function dismiss() {
    setItem(DISMISS_KEY, true);
    setOpen(false);
  }

  return (
    <div className="float-above-tabbar fixed left-4 right-4 z-50 px-4 py-3 rounded-2xl bg-zinc-900 border border-orange-500/40 shadow-xl">
      <div className="flex items-start gap-3">
        <div className="flex-1 text-sm text-zinc-200">
          <p className="font-semibold text-white mb-1">Add SwolTracker to your Home Screen</p>
          {apple ? (
            <p className="text-zinc-400">
              Tap <Share className="w-3.5 h-3.5 inline mb-0.5 text-orange-400" /> Share, then
              <span className="text-orange-300"> Add to Home Screen</span>. Full screen, no Safari chrome.
            </p>
          ) : (
            <p className="text-zinc-400">
              Use your browser menu → <span className="text-orange-300">Install app</span> / Add to Home Screen.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="w-8 h-8 rounded-lg hover:bg-zinc-800 flex items-center justify-center"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4 text-zinc-400" />
        </button>
      </div>
    </div>
  );
}
