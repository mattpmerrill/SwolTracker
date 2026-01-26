import { Users } from 'lucide-react';

/**
 * Banner shown when viewing another user's profile
 */
export default function ViewModeBanner({ buddyName, onExitView }) {
  return (
    <div className="bg-blue-600 px-4 py-2 flex items-center justify-between shadow-md relative z-30">
      <div className="flex items-center gap-2 text-white">
        <Users className="w-4 h-4" />
        <span className="text-sm font-medium">Viewing {buddyName}'s Profile</span>
      </div>
      <button
        onClick={onExitView}
        className="text-xs bg-white/20 hover:bg-white/30 text-white px-3 py-1 rounded-full font-medium transition-colors"
      >
        Exit View
      </button>
    </div>
  );
}
