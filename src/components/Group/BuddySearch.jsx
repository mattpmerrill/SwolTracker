import { Users } from 'lucide-react';
import AvatarDisplay from '../Profile/AvatarDisplay';

/**
 * Search and invite users to group
 */
export default function BuddySearch({
  searchTerm,
  searchResults,
  searchLoading,
  currentUser,
  profiles,
  groupRole,
  groupLeader,
  groupName,
  onSearchChange,
  onSendInvite,
  onAcceptRequest,
}) {
  const myProfile = profiles[currentUser] || {};

  const displayResults = searchResults;

  return (
    <div className="bg-zinc-900/80 p-5 rounded-2xl border border-zinc-800">
      <h3 className="font-bold mb-2">
        {groupRole === 'member'
          ? `Invite to ${groupLeader?.group_name || `${groupLeader?.name}'s Group`}`
          : `Invite to ${groupName || 'Your Group'}`}
      </h3>
      <p className="text-xs text-zinc-400 mb-4">
        {groupRole === 'member'
          ? `Invite others to follow ${groupLeader?.name || 'your leader'}'s workout program`
          : 'Send invites to share your AI-generated workouts with others'}
      </p>

      <div className="relative mb-4">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search by name or email..."
          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 px-10 focus:outline-none focus:border-blue-500 transition-colors"
        />
        <Users className="w-5 h-5 text-zinc-500 absolute left-3 top-3.5" />
        {searchLoading && (
          <div className="absolute right-3 top-3.5">
            <div className="w-5 h-5 border-2 border-zinc-600 border-t-blue-500 rounded-full animate-spin" />
          </div>
        )}
      </div>

      {searchTerm.trim() && (
        <div className="space-y-2">
          {displayResults.map(p => {
            const userId = p.user_id || p.id;
            const userName = p.name;
            const isBuddy = myProfile.buddies?.includes(userId);
            const isPending = myProfile.sentRequests?.some(r => r.to === userId);
            const isIncoming = myProfile.receivedRequests?.some(
              r => r.from === userId
            );
            const incomingReq = myProfile.receivedRequests?.find(
              r => r.from === userId
            );

            return (
              <div
                key={userId}
                className="flex items-center justify-between p-3 bg-zinc-800 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <AvatarDisplay user={p} size="sm" />
                  <div>
                    <span className="font-medium">{userName}</span>
                    {p.email && (
                      <p className="text-xs text-zinc-500">{p.email}</p>
                    )}
                  </div>
                </div>

                {isBuddy ? (
                  <span
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-500/20 text-green-400"
                  >
                    In Group
                  </span>
                ) : isPending ? (
                  <button
                    disabled
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-700 text-zinc-400 cursor-not-allowed"
                  >
                    Invite Sent
                  </button>
                ) : isIncoming ? (
                  <button
                    onClick={() =>
                      onAcceptRequest(incomingReq?.id, userId, userName, p.avatar)
                    }
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-500 text-white hover:bg-green-600"
                  >
                    Accept Request
                  </button>
                ) : (
                  <button
                    onClick={() => onSendInvite(userId, userName, p.avatar)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-500 text-white hover:bg-blue-600"
                  >
                    Send Invite
                  </button>
                )}
              </div>
            );
          })}
          {displayResults.length === 0 && !searchLoading && (
            <p className="text-center text-sm text-zinc-500 py-2">
              No users found.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
