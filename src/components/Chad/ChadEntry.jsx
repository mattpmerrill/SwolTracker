import { Dumbbell, ChevronRight } from 'lucide-react';

/**
 * Workout-screen entry point for Chad, the in-app coach. Orange/red brand
 * accent on purpose: cyan/teal is reserved for the user's own agent.
 */
export default function ChadEntry({ onOpen }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="mb-4 w-full text-left rounded-2xl border border-orange-500/25 bg-gradient-to-br from-orange-500/10 to-red-500/5 p-4 hover:border-orange-500/40 hover:from-orange-500/15 transition-all active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
    >
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shrink-0 shadow-lg shadow-orange-500/20">
          <Dumbbell className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-white">Ask Chad</p>
          <p className="text-sm text-zinc-400 mt-0.5">Questions about your training, or tweak today's workout</p>
        </div>
        <ChevronRight className="w-4 h-4 text-orange-400 shrink-0" />
      </div>
    </button>
  );
}
