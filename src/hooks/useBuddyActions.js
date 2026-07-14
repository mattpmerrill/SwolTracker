import { db } from '../lib/supabase';
import { validate, searchQuerySchema } from '../lib/validation';
import { reportWriteFailure } from '../lib/errorService';
import confetti from 'canvas-confetti';

/**
 * Buddy + group membership side-effects. All handlers return void; they mutate
 * the caller's state via the setters passed into the hook.
 */
export function useBuddyActions({
  currentUser,
  profiles,
  setProfiles,
  groupLeader,
  setGroupLeader,
  setGroupRole,
  setLeaderGymId,
  setWorkoutProgram,
  groupMembers,
  setGroupMembers,
  setBuddiesSearch,
  setSearchResults,
  setSearchLoading,
  toast,
}) {
  const fail = (operation, message, userMessage, context = {}) =>
    reportWriteFailure({
      db,
      toast,
      userId: currentUser,
      component: 'useBuddyActions.js',
      operation,
      message,
      userMessage,
      context,
    });

  const sendBuddyRequest = async (targetId, targetName = '', targetAvatar = '') => {
    if (targetId === currentUser || profiles[currentUser]?.buddies?.includes(targetId)) return;
    if (profiles[currentUser]?.sentRequests?.find((r) => r.to === targetId)) return;
    const result = await db.sendMemberInvite(currentUser, targetId);
    if (!result?.success) {
      await fail('sendBuddyRequest', result?.error || 'sendMemberInvite failed', result?.error || 'Failed to send invite');
      return;
    }
    setProfiles((prev) => ({
      ...prev,
      [currentUser]: {
        ...prev[currentUser],
        sentRequests: [
          ...(prev[currentUser].sentRequests || []),
          { to: targetId, name: targetName, avatar: targetAvatar, timestamp: new Date().toISOString() },
        ],
      },
    }));
    setBuddiesSearch('');
    toast.success?.('Invite sent');
  };

  const acceptBuddyRequest = async (requestId, requesterId, requesterName = '', requesterAvatar = '') => {
    const success = await db.acceptGroupInvite(requestId, currentUser);
    if (!success) {
      await fail('acceptBuddyRequest', 'acceptGroupInvite returned false', 'Could not accept invite. Try again.');
      return;
    }
    const leaderGym = await db.getLeaderGymId(currentUser);
    if (leaderGym) {
      setLeaderGymId(leaderGym);
      const programs = await db.getAllWorkoutPrograms(leaderGym);
      if (programs.length > 0) {
        setWorkoutProgram(programs.find((p) => p.is_active)?.program_data || programs[0] || {});
      }
    }
    setGroupRole('member');
    setGroupLeader({ id: requesterId, name: requesterName, avatar: requesterAvatar });
    setProfiles((prev) => {
      const u = { ...prev[currentUser] };
      u.receivedRequests = (u.receivedRequests || []).filter((r) => r.from !== requesterId);
      u.buddies = [...(u.buddies || []), requesterId];
      u.buddyProfiles = { ...(u.buddyProfiles || {}), [requesterId]: { id: requesterId, name: requesterName, avatar: requesterAvatar } };
      return { ...prev, [currentUser]: u };
    });
    confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
    toast.success?.('You joined the group!');
  };

  const declineBuddyRequest = async (requestId, requesterId) => {
    const success = await db.declineBuddyRequest(requestId);
    if (!success) {
      await fail('declineBuddyRequest', 'declineBuddyRequest returned false', 'Could not decline invite.');
      return;
    }
    setProfiles((prev) => ({
      ...prev,
      [currentUser]: {
        ...prev[currentUser],
        receivedRequests: (prev[currentUser].receivedRequests || []).filter((r) => r.from !== requesterId),
      },
    }));
  };

  const removeBuddy = async (buddyId) => {
    const success = await db.removeBuddy(currentUser, buddyId);
    if (!success) {
      await fail('removeBuddy', 'removeBuddy returned false', 'Could not remove buddy.');
      return;
    }
    setProfiles((prev) => {
      const u = { ...prev[currentUser] };
      u.buddies = (u.buddies || []).filter((id) => id !== buddyId);
      if (u.buddyProfiles) delete u.buddyProfiles[buddyId];
      return { ...prev, [currentUser]: u };
    });
  };

  const leaveWorkoutGroup = async () => {
    if (!confirm('Are you sure you want to leave the group?')) return;
    const success = await db.leaveWorkoutGroup(currentUser);
    if (!success) {
      await fail('leaveWorkoutGroup', 'leaveWorkoutGroup returned false', 'Could not leave the group.');
      return;
    }
    setGroupRole('independent');
    const prevLeader = groupLeader;
    setGroupLeader(null);
    setLeaderGymId(null);
    setWorkoutProgram({});
    setProfiles((prev) => {
      const u = { ...prev[currentUser] };
      if (prevLeader) {
        u.buddies = (u.buddies || []).filter((id) => id !== prevLeader.id);
        if (u.buddyProfiles) delete u.buddyProfiles[prevLeader.id];
      }
      return { ...prev, [currentUser]: u };
    });
    toast.success?.('Left the group');
  };

  const removeGroupMember = async (memberId, memberName) => {
    if (!confirm(`Remove ${memberName} from your group?`)) return;
    const success = await db.removeGroupMember(currentUser, memberId);
    if (!success) {
      await fail('removeGroupMember', 'removeGroupMember returned false', `Could not remove ${memberName}.`);
      return;
    }
    setGroupMembers((prev) => prev.filter((m) => m.member_id !== memberId && m.id !== memberId));
    setProfiles((prev) => {
      const u = { ...prev[currentUser] };
      u.buddies = (u.buddies || []).filter((id) => id !== memberId);
      if (u.buddyProfiles) delete u.buddyProfiles[memberId];
      return { ...prev, [currentUser]: u };
    });
    if (groupMembers.length <= 1) setGroupRole('independent');
  };

  const searchUsersInDb = async (searchTerm) => {
    const { success, data: query } = validate(searchQuerySchema, searchTerm);
    if (!success) { setSearchResults([]); return; }
    setSearchLoading(true);
    const results = await db.searchUsers(query, currentUser);
    if (results?.rateLimited) {
      toast.error(results.error);
      setSearchResults([]);
    } else {
      setSearchResults(results);
    }
    setSearchLoading(false);
  };

  return {
    sendBuddyRequest,
    acceptBuddyRequest,
    declineBuddyRequest,
    removeBuddy,
    leaveWorkoutGroup,
    removeGroupMember,
    searchUsersInDb,
  };
}
