import { Settings, User, Bot } from 'lucide-react';
import AvatarDisplay from '../Profile/AvatarDisplay';

/**
 * Header with app title, coach entry (Phase 3.5), settings, profile.
 */
export default function Header({
  user,
  onSettingsClick,
  onProfileClick,
  showCoach = false,
  coachUnread = false,
  onCoachClick,
}) {
  return (
    <header className="sticky top-0 z-40 bg-gradient-to-b from-zinc-900 to-zinc-900/95 backdrop-blur-xl border-b border-zinc-800/50">
      <div className="px-5 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AvatarDisplay user={user} size="md" />
            <div>
              <h1 className="text-lg font-bold tracking-tight">SwolTracker</h1>
              <p className="text-xs text-zinc-400 font-medium">
                {user?.name + "'s Training"}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {showCoach && (
              <button
                type="button"
                onClick={onCoachClick}
                aria-label={coachUnread ? 'Open Coach Board (unread)' : 'Open Coach Board'}
                className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-teal-500/20 border border-cyan-500/30 flex items-center justify-center hover:from-cyan-500/30 hover:to-teal-500/30 transition-colors"
              >
                <Bot className="w-5 h-5 text-cyan-300" />
                {coachUnread && (
                  <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-zinc-900" />
                )}
              </button>
            )}
            <button
              type="button"
              onClick={onSettingsClick}
              className="w-10 h-10 rounded-xl bg-zinc-800/80 flex items-center justify-center hover:bg-zinc-700 transition-colors"
            >
              <Settings className="w-5 h-5 text-zinc-300" />
            </button>
            <button
              type="button"
              onClick={onProfileClick}
              className="w-10 h-10 rounded-xl bg-zinc-800/80 flex items-center justify-center hover:bg-zinc-700 transition-colors"
            >
              <User className="w-5 h-5 text-zinc-300" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
