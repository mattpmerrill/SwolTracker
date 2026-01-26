import { useState, useCallback } from 'react';
import { db } from '../lib/supabase';
import confetti from 'canvas-confetti';

/**
 * Hook for managing workout group state (leaders, members, invites)
 */
export function useWorkoutGroup({
  currentUser,
  profiles,
  setProfiles,
  demoMode,
  toast,
  setWorkoutProgram,
  setViewingBuddy,
}) {
  const [groupRole, setGroupRole] = useState('independent'); // 'leader', 'member', 'independent'
  const [groupMembers, setGroupMembers] = useState([]);
  const [groupLeader, setGroupLeader] = useState(null);
  const [leaderGymId, setLeaderGymId] = useState(null);
  const [groupName, setGroupName] = useState('');
  const [editingGroupName, setEditingGroupName] = useState(false);

  // Search state
  const [buddiesSearch, setBuddiesSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // Send a buddy/member invite
  const sendBuddyRequest = useCallback(async (targetId, targetName = '', targetAvatar = '') => {
    if (targetId === currentUser || profiles[currentUser]?.buddies?.includes(targetId)) return;

    // Check for existing sent request
    const existingSent = profiles[currentUser]?.sentRequests?.find(r => r.to === targetId);
    if (existingSent) return;

    // Save to Supabase if authenticated
    if (!demoMode) {
      const result = await db.sendMemberInvite(currentUser, targetId);
      if (!result?.success) {
        toast.error(result?.error || 'Failed to send invite');
        return;
      }
    }

    // Optimistic update
    setProfiles(prev => ({
      ...prev,
      [currentUser]: {
        ...prev[currentUser],
        sentRequests: [...(prev[currentUser].sentRequests || []), { to: targetId, name: targetName, avatar: targetAvatar, timestamp: new Date().toISOString() }]
      }
    }));
    setBuddiesSearch('');
  }, [currentUser, profiles, demoMode, toast, setProfiles]);

  // Accept a buddy/group invite
  const acceptBuddyRequest = useCallback(async (requestId, requesterId, requesterName = '', requesterAvatar = '') => {
    // Save to Supabase if authenticated
    if (!demoMode) {
      const success = await db.acceptGroupInvite(requestId, currentUser);
      if (!success) return;

      // Get leader's gym for loading workouts
      const leaderGym = await db.getLeaderGymId(currentUser);
      if (leaderGym) {
        setLeaderGymId(leaderGym);
        // Load leader's workout program
        const programs = await db.getAllWorkoutPrograms(leaderGym);
        if (programs.length > 0) {
          // Find the active program
          const active = programs.find(p => p.is_active) || programs[0];
          setWorkoutProgram(active.program_data || {});
        }
      }
    }

    // Set group state - user is now a member following the leader
    setGroupRole('member');
    setGroupLeader({ id: requesterId, name: requesterName, avatar: requesterAvatar });

    // Optimistic update
    setProfiles(prev => {
      const newCurrentUser = { ...prev[currentUser] };
      newCurrentUser.receivedRequests = (newCurrentUser.receivedRequests || []).filter(r => r.from !== requesterId);
      newCurrentUser.buddies = [...(newCurrentUser.buddies || []), requesterId];
      newCurrentUser.buddyProfiles = {
        ...(newCurrentUser.buddyProfiles || {}),
        [requesterId]: { id: requesterId, name: requesterName, avatar: requesterAvatar }
      };

      return {
        ...prev,
        [currentUser]: newCurrentUser
      };
    });

    // Trigger confetti immediately for the accepting user
    confetti({
      particleCount: 150,
      spread: 70,
      origin: { y: 0.6 }
    });
  }, [currentUser, demoMode, setProfiles, setWorkoutProgram]);

  // Decline a buddy request
  const declineBuddyRequest = useCallback(async (requestId, requesterId) => {
    // Save to Supabase if authenticated
    if (!demoMode) {
      const success = await db.declineBuddyRequest(requestId);
      if (!success) return;
    }

    // Optimistic update
    setProfiles(prev => {
      const newCurrentUser = { ...prev[currentUser] };
      newCurrentUser.receivedRequests = (newCurrentUser.receivedRequests || []).filter(r => r.from !== requesterId);

      return {
        ...prev,
        [currentUser]: newCurrentUser
      };
    });
  }, [currentUser, demoMode, setProfiles]);

  // Remove a buddy
  const removeBuddy = useCallback(async (buddyId) => {
    // Save to Supabase if authenticated
    if (!demoMode) {
      const success = await db.removeBuddy(currentUser, buddyId);
      if (!success) return;
    }

    // Optimistic update
    setProfiles(prev => {
      const newCurrentUser = { ...prev[currentUser] };
      newCurrentUser.buddies = (newCurrentUser.buddies || []).filter(id => id !== buddyId);
      if (newCurrentUser.buddyProfiles) {
        delete newCurrentUser.buddyProfiles[buddyId];
      }

      return {
        ...prev,
        [currentUser]: newCurrentUser
      };
    });

    if (setViewingBuddy) {
      setViewingBuddy(current => current === buddyId ? null : current);
    }
  }, [currentUser, demoMode, setProfiles, setViewingBuddy]);

  // Leave workout group (for members)
  const leaveWorkoutGroup = useCallback(async () => {
    if (!confirm('Are you sure you want to leave the group? You will lose access to the current workout program and need to generate your own.')) {
      return;
    }

    if (!demoMode) {
      const success = await db.leaveWorkoutGroup(currentUser);
      if (!success) return;
    }

    // Reset group state
    setGroupRole('independent');
    const previousLeader = groupLeader;
    setGroupLeader(null);
    setLeaderGymId(null);
    setWorkoutProgram({});

    // Remove the leader from buddies list
    setProfiles(prev => {
      const newCurrentUser = { ...prev[currentUser] };
      if (previousLeader) {
        newCurrentUser.buddies = (newCurrentUser.buddies || []).filter(id => id !== previousLeader.id);
        if (newCurrentUser.buddyProfiles) {
          delete newCurrentUser.buddyProfiles[previousLeader.id];
        }
      }
      return {
        ...prev,
        [currentUser]: newCurrentUser
      };
    });
  }, [currentUser, demoMode, groupLeader, setProfiles, setWorkoutProgram]);

  // Remove a member from group (for leaders)
  const removeGroupMember = useCallback(async (memberId, memberName) => {
    if (!confirm(`Are you sure you want to remove ${memberName} from your group?`)) {
      return;
    }

    if (!demoMode) {
      const success = await db.removeGroupMember(currentUser, memberId);
      if (!success) return;
    }

    // Update group members list
    setGroupMembers(prev => prev.filter(m => m.id !== memberId));

    // Update buddies list
    setProfiles(prev => {
      const newCurrentUser = { ...prev[currentUser] };
      newCurrentUser.buddies = (newCurrentUser.buddies || []).filter(id => id !== memberId);
      if (newCurrentUser.buddyProfiles) {
        delete newCurrentUser.buddyProfiles[memberId];
      }
      return {
        ...prev,
        [currentUser]: newCurrentUser
      };
    });

    // Update group role if no more members
    if (groupMembers.length <= 1) {
      setGroupRole('independent');
    }
  }, [currentUser, demoMode, groupMembers.length, setProfiles]);

  // Search users from database
  const searchUsersInDb = useCallback(async (searchTerm) => {
    if (!searchTerm.trim() || demoMode) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    const results = await db.searchUsers(searchTerm, currentUser);
    setSearchResults(results);
    setSearchLoading(false);
  }, [currentUser, demoMode]);

  // Update group name
  const updateGroupName = useCallback(async (newName) => {
    setGroupName(newName);
    if (!demoMode) {
      await db.updateProfile(currentUser, { group_name: newName });
    }
    setEditingGroupName(false);
  }, [currentUser, demoMode]);

  return {
    groupRole,
    setGroupRole,
    groupMembers,
    setGroupMembers,
    groupLeader,
    setGroupLeader,
    leaderGymId,
    setLeaderGymId,
    groupName,
    setGroupName,
    editingGroupName,
    setEditingGroupName,
    buddiesSearch,
    setBuddiesSearch,
    searchResults,
    setSearchResults,
    searchLoading,
    sendBuddyRequest,
    acceptBuddyRequest,
    declineBuddyRequest,
    removeBuddy,
    leaveWorkoutGroup,
    removeGroupMember,
    searchUsersInDb,
    updateGroupName,
  };
}
