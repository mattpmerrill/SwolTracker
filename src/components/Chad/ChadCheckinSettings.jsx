import { useEffect, useState } from 'react';
import { Dumbbell, Loader2 } from 'lucide-react';
import { getPushEnabled, isPushSupported } from '../../lib/push';
import { checkinSettingsView } from '../../utils/checkinView';

/**
 * Settings card for Chad's weekly check-in. Hidden until the server says check-ins are set up.
 * An eligible user gets the switch; someone who cannot use it (a group member, say) gets a plain
 * reason. `checkin` is { status, saving, onSetEnabled, onRefreshStatus } from the shell.
 */
export default function ChadCheckinSettings({ checkin }) {
  const { status, saving = false, onSetEnabled, onRefreshStatus } = checkin || {};
  const [pushEnabled, setPushEnabled] = useState(null);

  // The status may be old (or never fetched, for a user who has not turned this on): ask again
  // whenever the settings open.
  useEffect(() => {
    onRefreshStatus?.();
  }, [onRefreshStatus]);

  useEffect(() => {
    if (!isPushSupported()) return undefined;
    let cancelled = false;
    getPushEnabled()
      .then((enabled) => { if (!cancelled) setPushEnabled(enabled); })
      .catch(() => { if (!cancelled) setPushEnabled(null); });
    return () => { cancelled = true; };
  }, []);

  const view = checkinSettingsView(status, { pushEnabled });
  if (!view.show) return null;

  return (
    <div className="mb-6 bg-gradient-to-br from-orange-500/10 to-red-500/5 rounded-2xl border border-orange-500/20 p-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shrink-0">
          <Dumbbell className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 id="weekly-checkin-label" className="font-bold">Weekly check-in with Chad</h3>
          <p id="weekly-checkin-help" className="text-xs text-zinc-400">
            Sunday evening, Chad reviews your week and proposes changes to the next one. You approve every change.
          </p>
        </div>
        {view.canToggle && (
          <button
            type="button"
            role="switch"
            aria-checked={view.enabled}
            aria-labelledby="weekly-checkin-label"
            aria-describedby="weekly-checkin-help"
            disabled={saving}
            onClick={() => onSetEnabled?.(!view.enabled)}
            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 ${
              view.enabled ? 'bg-orange-500' : 'bg-zinc-700'
            }`}
          >
            <span className="sr-only">{view.enabled ? 'Turn off weekly check-in' : 'Turn on weekly check-in'}</span>
            {saving ? (
              <Loader2 className="absolute left-1/2 -translate-x-1/2 w-4 h-4 animate-spin motion-reduce:animate-none text-white" />
            ) : (
              <span
                aria-hidden="true"
                className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform motion-reduce:transition-none ${
                  view.enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            )}
          </button>
        )}
      </div>
      {view.explanation && (
        <p className="mt-3 text-sm text-zinc-300">{view.explanation}</p>
      )}
      {view.pushHint && (
        <p className="mt-3 text-xs text-amber-400">{view.pushHint}</p>
      )}
    </div>
  );
}
