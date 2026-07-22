import { Bot } from 'lucide-react';

/**
 * Floating action button for agent chat — fixed bottom-right, above BottomNav.
 *
 * UNUSED as of 2026-07-22: shell no longer mounts this. Coach Board entry is
 * Header Bot + workout CoachBoardEntry only (triple-entry felt cluttered).
 * Kept for easy restore if we want a single-tab FAB again.
 */
export default function AgentChatFAB({ hasUnread, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={hasUnread ? 'Open Coach Board (unread)' : 'Open Coach Board'}
      className="fixed bottom-24 right-4 z-40 w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500 to-teal-600 shadow-lg shadow-cyan-500/30 flex items-center justify-center hover:scale-105 hover:shadow-cyan-500/50 active:scale-95 transition-all"
    >
      <Bot className="w-7 h-7 text-white" />
      {hasUnread && (
        <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 rounded-full border-2 border-zinc-950" />
      )}
    </button>
  );
}
