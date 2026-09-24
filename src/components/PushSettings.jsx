import { useState, useEffect } from 'react';
import { Bell, BellRing, Loader2 } from 'lucide-react';
import {
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
  testPush,
  getPushEnabled,
} from '../lib/push';

export default function PushSettings() {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);
  const supported = isPushSupported();

  useEffect(() => {
    if (supported) getPushEnabled().then(setEnabled);
  }, [supported]);

  const toggle = async () => {
    setBusy(true);
    setDenied(false);
    const res = enabled ? await unsubscribeFromPush() : await subscribeToPush();
    setBusy(false);
    if (res.ok) setEnabled(!enabled);
    else if (res.error === 'denied') setDenied(true);
  };

  const sendTest = async () => {
    setBusy(true);
    await testPush();
    setBusy(false);
  };

  if (!supported) return null;

  return (
    <div className="mb-6 bg-gradient-to-br from-violet-500/10 to-purple-500/10 rounded-2xl border border-violet-500/20 p-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
          {enabled ? <BellRing className="w-5 h-5" /> : <Bell className="w-5 h-5" />}
        </div>
        <div>
          <h3 className="font-bold">Workout reminders</h3>
          <p className="text-xs text-zinc-400">Get nudged when a workout is due.</p>
        </div>
      </div>
      {denied && (
        <p className="text-xs text-amber-400 mb-2">
          Notifications are blocked. Allow them in your browser settings, then try again.
        </p>
      )}
      <div className="flex gap-2">
        <button
          onClick={toggle}
          disabled={busy}
          className="flex-1 py-2.5 rounded-xl bg-violet-500/20 border border-violet-500/30 text-violet-200 text-sm font-medium hover:bg-violet-500/30 disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : enabled ? 'Turn off reminders' : 'Turn on reminders'}
        </button>
        {enabled && (
          <button
            onClick={sendTest}
            disabled={busy}
            className="px-3 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-300 text-sm hover:bg-zinc-700 disabled:opacity-50"
          >
            Send test
          </button>
        )}
      </div>
    </div>
  );
}
