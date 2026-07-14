import { Bot, MessageSquare, ChevronRight } from 'lucide-react';

/**
 * Always-visible Coach Board entry on the workout surface (Phase 3.5).
 * Not FAB-only — lives in the primary workout stack.
 */
export default function CoachBoardEntry({
  hasUnread = false,
  hasLatestNote = false,
  onOpen,
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="mb-4 w-full text-left rounded-2xl border border-cyan-500/25 bg-gradient-to-br from-cyan-500/10 to-teal-500/5 p-4 hover:border-cyan-500/40 hover:from-cyan-500/15 transition-all active:scale-[0.99]"
    >
      <div className="flex items-center gap-3">
        <div className="relative w-11 h-11 rounded-xl bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center shrink-0 shadow-lg shadow-cyan-500/20">
          <Bot className="w-5 h-5 text-white" />
          {hasUnread && (
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-zinc-950" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-white">Coach Board</p>
            {hasUnread && (
              <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-red-500/20 text-red-300 border border-red-500/30">
                New
              </span>
            )}
          </div>
          <p className="text-sm text-zinc-400 mt-0.5">
            {hasLatestNote
              ? 'Reviews, program notes, and your messages'
              : 'Leave a note for your coach — picked up on next check-in'}
          </p>
        </div>
        <div className="flex items-center gap-1 text-cyan-400 shrink-0">
          <MessageSquare className="w-4 h-4" />
          <ChevronRight className="w-4 h-4" />
        </div>
      </div>
    </button>
  );
}
