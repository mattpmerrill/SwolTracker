import { Users, Trash2 } from 'lucide-react';
import AvatarDisplay from '../Profile/AvatarDisplay';

/**
 * List of buddies for independent users
 */
export default function BuddiesList({
  buddies,
  buddyProfiles,
  profiles,
  onRemove,
}) {
  if (!buddies?.length) return null;

  return (
    <div className="mb-8">
      <h3 className="font-semibold mb-3 flex items-center gap-2">
        <Users className="w-5 h-5 text-blue-500" />
        My Buddies
      </h3>
      <div className="grid gap-3">
        {buddies.map(buddyId => {
          const buddy = buddyProfiles?.[buddyId] || profiles[buddyId];
          if (!buddy) return null;

          return (
            <div
              key={buddyId}
              className="bg-zinc-900/50 border border-zinc-800 p-4 rounded-xl flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <AvatarDisplay user={buddy} size="lg" />
                <div>
                  <p className="font-bold">{buddy.name}</p>
                  <p className="text-xs text-zinc-400">
                    {buddy.email || 'Gym Buddy'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  if (confirm('Remove buddy?')) onRemove(buddyId);
                }}
                className="p-2 text-zinc-500 hover:text-red-400"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
