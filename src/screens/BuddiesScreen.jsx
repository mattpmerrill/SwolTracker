import {
  MemberStatusBanner,
  LeaderStatusBanner,
  GroupMembersList,
  GroupInvites,
  BuddySearch,
  BuddiesList,
} from '../components/Group';

/**
 * Buddies/Group tab screen composition
 */
export default function BuddiesScreen({
  currentUser,
  user,
  profiles,
  groupRole,
  groupLeader,
  groupMembers,
  groupName,
  editingGroupName,
  buddiesSearch,
  searchResults,
  searchLoading,
  onLeaveGroup,
  onRemoveMember,
  onStartEditGroupName,
  onSaveGroupName,
  onCancelEditGroupName,
  onGroupNameChange,
  onAcceptInvite,
  onDeclineInvite,
  onSearchChange,
  onSendInvite,
  onRemoveBuddy,
}) {
  return (
    <>
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2">Workout Group</h2>
        <p className="text-zinc-400">Train together, grow together</p>
      </div>

      {/* Member Status Banner */}
      {groupRole === 'member' && groupLeader && (
        <MemberStatusBanner
          groupLeader={groupLeader}
          onLeave={onLeaveGroup}
        />
      )}

      {/* Leader Status Banner */}
      {groupRole === 'leader' && (
        <LeaderStatusBanner
          groupName={groupName}
          memberCount={groupMembers.length}
          isEditing={editingGroupName}
          onStartEdit={onStartEditGroupName}
          onSaveEdit={onSaveGroupName}
          onCancelEdit={onCancelEditGroupName}
          onNameChange={onGroupNameChange}
        />
      )}

      {/* Group Members List (for leaders) */}
      {groupRole === 'leader' && groupMembers.length > 0 && (
        <GroupMembersList
          members={groupMembers}
          onRemove={onRemoveMember}
        />
      )}

      {/* Leader with no loaded members — should be rare after migration 033 */}
      {groupRole === 'leader' && groupMembers.length === 0 && (
        <div className="mb-8 text-center py-6 bg-zinc-900/30 rounded-xl border border-dashed border-zinc-800">
          <p className="text-zinc-500 text-sm mb-1">
            No group members loaded yet.
          </p>
          <p className="text-zinc-600 text-xs">
            If someone already accepted your invite, refresh the page. You can also re-send an invite below.
          </p>
        </div>
      )}

      {/* Group Invites */}
      {user.receivedRequests?.length > 0 && (
        <GroupInvites
          invites={user.receivedRequests}
          profiles={profiles}
          groupRole={groupRole}
          onAccept={onAcceptInvite}
          onDecline={onDeclineInvite}
        />
      )}

      {/* Buddies List (for independent users) */}
      {user.buddies?.length > 0 && groupRole === 'independent' && (
        <BuddiesList
          buddies={user.buddies}
          buddyProfiles={user.buddyProfiles}
          profiles={profiles}
          onRemove={onRemoveBuddy}
        />
      )}

      {/* Empty state for independent users */}
      {groupRole === 'independent' && !user.buddies?.length && !user.receivedRequests?.length && (
        <div className="mb-8 text-center py-8 bg-zinc-900/30 rounded-xl border border-dashed border-zinc-800">
          <p className="text-zinc-500 text-sm mb-2">
            You're not in a workout group yet.
          </p>
          <p className="text-zinc-600 text-xs">
            Send invites below to share your AI-generated workouts with others.
          </p>
        </div>
      )}

      {/* Search and Invite */}
      <BuddySearch
        searchTerm={buddiesSearch}
        searchResults={searchResults}
        searchLoading={searchLoading}
        currentUser={currentUser}
        profiles={profiles}
        groupRole={groupRole}
        groupLeader={groupLeader}
        groupName={groupName}
        onSearchChange={onSearchChange}
        onSendInvite={onSendInvite}
        onAcceptRequest={onAcceptInvite}
      />
    </>
  );
}
