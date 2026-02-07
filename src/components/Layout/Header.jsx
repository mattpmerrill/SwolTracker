import { Settings, User } from 'lucide-react';
import AvatarDisplay from '../Profile/AvatarDisplay';

/**
 * Header component with app title, user avatar, and settings/profile buttons
 */
export default function Header({
  user,
  onSettingsClick,
  onProfileClick,
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
            <button
              onClick={onSettingsClick}
              className="w-10 h-10 rounded-xl bg-zinc-800/80 flex items-center justify-center hover:bg-zinc-700 transition-colors"
            >
              <Settings className="w-5 h-5 text-zinc-300" />
            </button>
            <button
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
