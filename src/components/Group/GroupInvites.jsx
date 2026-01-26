import { UserPlus, AlertCircle } from 'lucide-react';
import AvatarDisplay from '../Profile/AvatarDisplay';

/**
 * Pending group invites section
 */
export default function GroupInvites({
  invites,
  profiles,
  groupRole,
  onAccept,
  onDecline,
}) {
  if (!invites?.length) return null;

  return (
    <div className="mb-8">
      <h3 className="font-semibold mb-3 flex items-center gap-2 text-orange-400">
        <UserPlus className="w-5 h-5" />
        Group Invites ({invites.length})
      </h3>
      <div className="space-y-3">
        {invites.map((req) => {
          const requester = { ...profiles[req.from], ...req };
          const requesterName = requester.name || 'Unknown';
          const canAccept = groupRole === 'independent';

          return (
            <div
              key={req.from}
              className="bg-zinc-800/80 p-4 rounded-xl border border-orange-500/30"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <AvatarDisplay user={requester} size="sm" />
                  <div>
                    <p className="font-semibold">{requesterName}</p>
                    <p className="text-xs text-zinc-400">
                      Wants you to follow their workouts
                    </p>
                  </div>
                </div>
              </div>

              {/* Warning message */}
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 mb-3">
                <p className="text-xs text-yellow-400">
                  <AlertCircle className="w-4 h-4 inline mr-1" />
                  Accepting will replace your workouts with {requesterName}'s
                  program. You won't be able to generate your own workouts until
                  you leave the group.
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() =>
                    onAccept(req.id, req.from, requesterName, requester.avatar)
                  }
                  disabled={!canAccept}
                  className={`flex-1 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium ${
                    !canAccept ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  Accept & Follow
                </button>
                <button
                  onClick={() => onDecline(req.id, req.from)}
                  className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg"
                >
                  Decline
                </button>
              </div>

              {!canAccept && (
                <p className="text-xs text-red-400 mt-2">
                  {groupRole === 'leader'
                    ? 'You have followers. Remove them first to join another group.'
                    : 'You are already following someone. Leave that group first.'}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
