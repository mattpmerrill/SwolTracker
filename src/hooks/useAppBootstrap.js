import { useCallback, useEffect, useState } from 'react';
import { db } from '../lib/supabase';
import {
  BOOTSTRAP_LOG_LOOKBACK_WEEKS,
  exerciseLogFromRows,
  getBootstrapLogFromWeek,
} from '../lib/bootstrapLogs';
import { calculateCurrentWeek } from '../utils/date';

/**
 * One-shot bootstrap that turns an authenticated user into a fully loaded
 * app state bundle. Called when authUser arrives, and again when `reload()`
 * is invoked (e.g. after onboarding completes). Returns a loading flag, an
 * onboarding signal, the data bundle to hydrate app state with, and reload.
 *
 * Consumers wire the returned bundle into their local state via a single
 * effect; we do not own the state here.
 */
export function useAppBootstrap(authUser) {
  const [isLoading, setIsLoading] = useState(true);
  const [bundle, setBundle] = useState(null);
  const [onboarding, setOnboarding] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => {
    setReloadToken((t) => t + 1);
  }, []);

  useEffect(() => {
    if (!authUser) {
      setIsLoading(false);
      setBundle(null);
      setOnboarding(null);
      return;
    }

    let cancelled = false;

    (async () => {
      setIsLoading(true);
      try {
        const loaded = await loadUserBundle(authUser);
        if (cancelled) return;

        if (loaded.kind === 'onboarding') {
          setOnboarding(loaded.onboardingData);
          setBundle(null);
        } else {
          setBundle(loaded);
          setOnboarding(null);
        }
      } catch (error) {
        console.error('Error loading app bundle:', error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [authUser, reloadToken]);

  return { isLoading, bundle, onboarding, reload };
}

async function loadUserBundle(authUser) {
  const userId = authUser.id;

  const profile = await db.getProfile(userId);
  if (!profile?.onboarding_completed) {
    return {
      kind: 'onboarding',
      onboardingData: {
        id: userId,
        name: authUser.user_metadata?.full_name || authUser.email?.split('@')[0] || '',
        email: authUser.email,
      },
    };
  }

  const [buddies, receivedRequests, sentRequests, groupRoleData] = await Promise.all([
    db.getBuddies(userId),
    db.getReceivedRequests(userId),
    db.getSentRequests(userId),
    db.getGroupRole(userId),
  ]);

  let groupLeader = null;
  let groupMembers = [];
  if (groupRoleData.role === 'member' && groupRoleData.leader_id) {
    groupLeader = {
      id: groupRoleData.leader_id,
      name: groupRoleData.leader_name,
      avatar: groupRoleData.leader_avatar,
      avatar_url: groupRoleData.leader_avatar_url,
      group_name: groupRoleData.group_name,
    };
  } else if (groupRoleData.role === 'leader') {
    // Always fetch members for leaders (do not gate on member_count alone).
    groupMembers = await db.getGroupMembers(userId);
    // Fallback: accepted buddies are the same relationship if the RPC fails/empty.
    if (groupMembers.length === 0 && (groupRoleData.member_count || 0) > 0 && buddies.length > 0) {
      groupMembers = buddies.map((b) => ({
        member_id: b.buddy_id,
        member_name: b.buddy_name,
        member_avatar: b.buddy_avatar,
        member_avatar_url: b.buddy_avatar_url || null,
        member_email: b.buddy_email,
        joined_at: b.connected_at,
      }));
    }
  }

  const maxes = (await db.getUserMaxes(userId)) || {};
  const mergedProfile = {
    id: userId,
    name: authUser.user_metadata.full_name || authUser.email.split('@')[0],
    avatar: authUser.user_metadata.avatar_url || '💪',
    ...profile,
    maxes,
    buddies: buddies.map((b) => b.buddy_id),
    buddyProfiles: buddies.reduce((acc, b) => {
      acc[b.buddy_id] = { id: b.buddy_id, name: b.buddy_name, avatar: b.buddy_avatar, email: b.buddy_email };
      return acc;
    }, {}),
    receivedRequests: receivedRequests.map((r) => ({ id: r.request_id, from: r.sender_id, name: r.sender_name, avatar: r.sender_avatar, timestamp: r.created_at })),
    sentRequests: sentRequests.map((r) => ({ id: r.request_id, to: r.receiver_id, name: r.receiver_name, avatar: r.receiver_avatar, timestamp: r.created_at })),
    acceptedNotifications: [],
  };

  let programStartDate = new Date().toISOString();
  let currentWeek = 1;
  if (profile.program_start_date) {
    const startDate = new Date(profile.program_start_date);
    programStartDate = startDate.toISOString();
    currentWeek = calculateCurrentWeek(startDate.toISOString());
  }

  const gyms = await db.getMyGyms(userId);
  const gymId = gyms.length === 0
    ? (await db.createGym('Personal Gym', userId))?.id
    : gyms[0].id;

  let equipment = null;
  let leaderGymId = null;
  let workoutProgram = {};
  let exerciseLog = {};
  let completedWorkouts = {};
  let missedWorkouts = {};
  // Phase 1.4: set logs are windowed; completions/missed stay full (small).
  let logFromWeek = 1;

  if (gymId) {
    const eq = await db.getGymEquipment(gymId);
    if (eq.length > 0) equipment = eq;

    let programGymId = gymId;
    if (groupRoleData.role === 'member') {
      const gym = await db.getLeaderGymId(userId);
      if (gym) { programGymId = gym; leaderGymId = gym; }
    }

    const programs = await db.getAllWorkoutPrograms(programGymId);
    if (Object.keys(programs).length > 0) workoutProgram = programs;

    logFromWeek = getBootstrapLogFromWeek(currentWeek, BOOTSTRAP_LOG_LOOKBACK_WEEKS);
    const logs = await db.getWorkoutLogsInWeekRange(gymId, logFromWeek);
    exerciseLog = exerciseLogFromRows(logs);

    const completions = await db.getWorkoutCompletions(gymId);
    completions.forEach((c) => {
      completedWorkouts[`${c.user_id}-${c.week_number}-${c.day_name}`] = true;
    });

    const missedRows = await db.getMissedDays(gymId);
    missedRows.forEach((m) => {
      missedWorkouts[`${m.user_id}-${m.week_number}-${m.day_name}`] = {
        reason: m.reason || null,
      };
    });
  }

  const [unreadAgent, coachNote, agentKey] = await Promise.all([
    db.hasUnreadAgentMessages(userId),
    db.getLatestCoachNote(userId),
    db.hasAgentKey(userId),
  ]);

  return {
    kind: 'ready',
    userId,
    profile: mergedProfile,
    groupRole: groupRoleData.role,
    groupName: groupRoleData.group_name || '',
    groupLeader,
    groupMembers,
    leaderGymId,
    gymId,
    equipment,
    programStartDate,
    currentWeek,
    workoutProgram,
    exerciseLog,
    completedWorkouts,
    missedWorkouts,
    /** Earliest week currently in exerciseLog (for lazy older-week fetch). */
    logFromWeek,
    hasUnreadAgentMessages: unreadAgent,
    latestCoachNote: coachNote,
    hasAgentKey: agentKey,
  };
}
