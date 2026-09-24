import { useState } from 'react';
import { Bell, Loader2 } from 'lucide-react';
import { subscribeToPush } from '../lib/push';

const FLAG = 'swoltracker-push-prompt-shown';

export default function PushOptInPrompt({ onClose }) {
  const [busy, setBusy] = useState(false);

  const enable = async () => {
    setBusy(true);
    await subscribeToPush();
    localStorage.setItem(FLAG, '1');
    onClose();
  };

  const dismiss = () => {
    localStorage.setItem(FLAG, '1');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-zinc-900 rounded-2xl p-6 border border-zinc-800">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
            <Bell className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-lg">Stay on track</h3>
        </div>
        <p className="text-sm text-zinc-400 mb-5">
          Two workouts down! Get a nudge when your next one is due so you never miss a session.
        </p>
        <div className="flex gap-2">
          <button
            onClick={enable}
            disabled={busy}
            className="flex-1 py-2.5 rounded-xl bg-violet-500 hover:bg-violet-600 font-semibold disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Turn on reminders'}
          </button>
          <button onClick={dismiss} className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300">
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
