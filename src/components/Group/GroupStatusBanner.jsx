import { Dumbbell, Edit3, Check, X } from 'lucide-react';
import AvatarDisplay from '../Profile/AvatarDisplay';

/**
 * Status banner for group members showing who they're following
 */
export function MemberStatusBanner({ groupLeader, onLeave }) {
  return (
    <div className="mb-6 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-2xl border border-blue-500/30 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AvatarDisplay user={groupLeader} size="lg" />
          <div>
            <p className="text-xs text-blue-400 uppercase tracking-wider">Following</p>
            <p className="font-bold text-lg">
              {groupLeader?.group_name || `${groupLeader?.name}'s Group`}
            </p>
          </div>
        </div>
        <button
          onClick={onLeave}
          className="px-4 py-2 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg text-sm font-medium"
        >
          Leave Group
        </button>
      </div>
      <p className="text-sm text-zinc-400 mt-3">
        You're following {groupLeader?.name}'s workout program. Complete your sets and log your progress!
      </p>
    </div>
  );
}

/**
 * Status banner for group leaders
 */
export function LeaderStatusBanner({
  groupName,
  memberCount,
  isEditing,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onNameChange,
}) {
  return (
    <div className="mb-6 bg-gradient-to-br from-orange-500/20 to-yellow-500/20 rounded-2xl border border-orange-500/30 p-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-yellow-500 flex items-center justify-center">
          <Dumbbell className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1">
          <p className="text-xs text-orange-400 uppercase tracking-wider">Group Leader</p>
          {isEditing ? (
            <div className="flex items-center gap-2 mt-1">
              <input
                type="text"
                value={groupName}
                onChange={(e) => onNameChange(e.target.value)}
                placeholder="Enter group name..."
                className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1 text-sm focus:outline-none focus:border-orange-500"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    onSaveEdit();
                  } else if (e.key === 'Escape') {
                    onCancelEdit();
                  }
                }}
              />
              <button
                onClick={onSaveEdit}
                className="p-1 text-green-500 hover:text-green-400"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={onCancelEdit}
                className="p-1 text-zinc-500 hover:text-zinc-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <p className="font-bold text-lg">{groupName || 'Your Group'}</p>
              <button
                onClick={onStartEdit}
                className="p-1 text-zinc-500 hover:text-orange-400"
              >
                <Edit3 className="w-4 h-4" />
              </button>
            </div>
          )}
          <p className="text-sm text-zinc-400">
            {memberCount} member{memberCount !== 1 ? 's' : ''}
          </p>
        </div>
      </div>
      <p className="text-sm text-zinc-400">
        Your AI-generated workouts are shared with your group members.
      </p>
    </div>
  );
}
