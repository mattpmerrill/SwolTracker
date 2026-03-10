import { useState, useEffect, useRef, useCallback } from 'react';
import { X, SkipForward } from 'lucide-react';

/**
 * Rest timer that appears after logging a set.
 * Auto-dismisses when the countdown hits zero.
 * User can skip early or dismiss.
 *
 * Props:
 *   exerciseName  — name of the exercise just logged
 *   setIndex      — 0-based set that was just completed
 *   totalSets     — total sets for this exercise
 *   restSeconds   — recommended rest duration (default 90s)
 *   onDismiss     — called when timer is dismissed or completes
 */
export default function RestTimer({
  exerciseName,
  setIndex,
  totalSets,
  restSeconds = 90,
  onDismiss,
}) {
  const [secondsLeft, setSecondsLeft] = useState(restSeconds);
  const intervalRef = useRef(null);

  const dismiss = useCallback(() => {
    clearInterval(intervalRef.current);
    onDismiss?.();
  }, [onDismiss]);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          clearInterval(intervalRef.current);
          // Small delay so user sees 0:00 briefly before auto-dismiss
          setTimeout(() => onDismiss?.(), 600);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [onDismiss]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const pct = ((restSeconds - secondsLeft) / restSeconds) * 100;
  const isLastSet = setIndex + 1 >= totalSets;

  return (
    <div className="fixed bottom-28 left-4 right-4 z-50 pointer-events-none flex justify-center">
      <div className="pointer-events-auto w-full max-w-sm bg-zinc-900 border border-zinc-700/60 rounded-2xl shadow-2xl shadow-black/40 overflow-hidden">
        {/* Progress bar across the top */}
        <div className="h-1 bg-zinc-800">
          <div
            className="h-full bg-gradient-to-r from-orange-500 to-red-500 transition-all duration-1000 ease-linear"
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="px-4 py-3 flex items-center gap-4">
          {/* Timer */}
          <div className="flex-shrink-0 text-center">
            <div className={`text-3xl font-bold tabular-nums leading-none ${
              secondsLeft <= 10 ? 'text-orange-400' : 'text-white'
            }`}>
              {minutes}:{String(seconds).padStart(2, '0')}
            </div>
            <div className="text-xs text-zinc-500 mt-0.5">rest</div>
          </div>

          {/* Label */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">
              {isLastSet ? '🎉 Last set done!' : `Set ${setIndex + 1} done`}
            </p>
            <p className="text-xs text-zinc-400 truncate">{exerciseName}</p>
            {!isLastSet && (
              <p className="text-xs text-zinc-500 mt-0.5">
                {totalSets - setIndex - 1} set{totalSets - setIndex - 1 !== 1 ? 's' : ''} remaining
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={dismiss}
              className="p-2 rounded-xl bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 transition-colors"
              title="Skip rest"
            >
              <SkipForward className="w-4 h-4" />
            </button>
            <button
              onClick={dismiss}
              className="p-2 rounded-xl hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
