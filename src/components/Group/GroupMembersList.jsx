import { Users, X } from 'lucide-react';
import AvatarDisplay from '../Profile/AvatarDisplay';

/**
 * List of group members (for leaders)
 */
export default function GroupMembersList({ members, onRemove }) {
  if (!members?.length) return null;

  return (
    <div className="mb-8">
      <h3 className="font-semibold mb-3 flex items-center gap-2">
        <Users className="w-5 h-5 text-blue-500" />
        Group Members
      </h3>
      <div className="grid gap-3">
        {members.map(member => (
          <div
            key={member.member_id}
            className="bg-zinc-900/50 border border-zinc-800 p-4 rounded-xl flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <AvatarDisplay
                user={{
                  avatar: member.member_avatar,
                  avatar_url: member.member_avatar_url,
                  name: member.member_name
                }}
                size="lg"
              />
              <div>
                <p className="font-bold">{member.member_name}</p>
                <p className="text-xs text-zinc-400">{member.member_email}</p>
              </div>
            </div>
            <button
              onClick={() => {
                if (confirm(`Remove ${member.member_name} from your group?`)) {
                  onRemove(member.member_id);
                }
              }}
              className="p-2 text-zinc-500 hover:text-red-400"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
