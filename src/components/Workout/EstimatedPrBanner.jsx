import { Flame, X } from 'lucide-react';

/**
 * Celebration banner shown when a logged set produces a new estimated 1RM.
 * Offers a one-tap "Save as new max" (never auto-saves) and a dismiss.
 * The wrapper is pointer-events-none so it never blocks set logging.
 */
export default function EstimatedPrBanner({ pr, onSave, onDismiss }) {
  if (!pr) return null;

  return (
    <div className="fixed bottom-24 left-0 right-0 z-[90] px-4 pointer-events-none">
      <div className="mx-auto max-w-md pointer-events-auto">
        <div className="bg-gradient-to-r from-orange-500/20 to-red-500/20 border border-orange-500/40 rounded-2xl p-4 shadow-xl shadow-orange-500/20 backdrop-blur-xl">
          <div className="flex items-start gap-3">
            <Flame className="w-6 h-6 text-orange-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-white">Estimated PR!</p>
              <p className="text-sm text-zinc-300 mt-0.5">
                {pr.exerciseName} <span className="text-orange-300 font-semibold">~{pr.estMax} lbs</span>
              </p>
              <div className="flex gap-2 mt-3">
                <button
                  type="button"
                  onClick={onSave}
                  className="flex-1 px-3 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  Save as new max
                </button>
                <button
                  type="button"
                  onClick={onDismiss}
                  className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium rounded-lg transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss"
              className="text-zinc-500 hover:text-zinc-300 p-1 -m-1 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
