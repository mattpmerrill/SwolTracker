import { useCallback, useEffect, useState } from 'react';
import { db } from '../lib/supabase';
import {
  BOOTSTRAP_LOG_LOOKBACK_WEEKS,
  exerciseLogFromRows,
  getBootstrapLogFromWeek,
} from '../lib/bootstrapLogs';
import { calculateCurrentWeek } from '../utils/date';

/** True when the first load failed and there is nothing to show. */
export function isBootstrapLoadError(loadError, bundle) {
  return Boolean(loadError) && !bundle;
}

/**
 * One-shot bootstrap that turns an authenticated user into a fully loaded
 * app state bundle. Called when authUser arrives, and again when `reload()`
 * is invoked (e.g. after onboarding completes). Returns a loading flag, an
 * onboarding signal, the data bundle to hydrate app state with, reload, and
 * loadError (set when the bundle load throws; retry via reload()).
 *
 * Consumers wire the returned bundle into their local state via a single
 * effect; we do not own the state here.
 */

export function useAppBootstrap(authUser) {
  const [isLoading, setIsLoading] = useState(true);
  const [bundle, setBundle] = useState(null);
  const [onboarding, setOnboarding] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => {
    setReloadToken((t) => t + 1);
  }, []);

  useEffect(() => {
    if (!authUser) {
      setIsLoading(false);
      setBundle(null);
      setOnboarding(null);
      setLoadError(null);
      return;
    }

    let cancelled = false;

    (async () => {
      setIsLoading(true);
      setLoadError(null);
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
        if (!cancelled) {
          setLoadError(error);
          setOnboarding(null);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [authUser, reloadToken]);

  return { isLoading, bundle, onboarding, reload, loadError };
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

  // Wave 1 — every read keyed only on userId, issued in parallel. The two
  // formerly conditional calls (group members for leaders, leader gym for
  // members) are safe to run for every user: both RPCs self-scope to
  // auth.uid() and return []/null for the roles that don't need them.
  const [
    buddies,
    receivedRequests,
    sentRequests,
    groupRoleData,
    groupMembersResult,
    leaderGymId,
    maxes,
    gyms,
    unreadAgent,
    coachNote,
    agentKey,
  ] = await Promise.all([
    db.getBuddies(userId),
    db.getReceivedRequests(userId),
    db.getSentRequests(userId),
    db.getGroupRole(userId),
    db.getGroupMembers(userId),
    db.getLeaderGymId(userId),
    db.getUserMaxes(userId),
    db.getMyGyms(userId),
    db.hasUnreadAgentMessages(userId),
    db.getLatestCoachNote(userId),
    db.hasAgentKey(userId),
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
    groupMembers = groupMembersResult;
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

  const mergedProfile = {
    id: userId,
    name: authUser.user_metadata.full_name || authUser.email.split('@')[0],
    avatar: authUser.user_metadata.avatar_url || '💪',
    ...profile,
    maxes: maxes || {},
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

  const gymId = gyms[0]?.id ?? null;

  // Wave 2 — gym-scoped reads (need gymId + currentWeek).
  let equipment = null;
  let workoutProgram = {};
  let exerciseLog = {};
  let completedWorkouts = {};
  let missedWorkouts = {};
  let logFromWeek = 1;
  let programGymId = gymId;

  if (gymId) {
    if (groupRoleData.role === 'member' && leaderGymId) {
      programGymId = leaderGymId;
    }
    logFromWeek = getBootstrapLogFromWeek(currentWeek, BOOTSTRAP_LOG_LOOKBACK_WEEKS);

    const [eq, programs, logs, completions, missedRows] = await Promise.all([
      db.getGymEquipment(gymId),
      db.getAllWorkoutPrograms(programGymId),
      db.getWorkoutLogsInWeekRange(gymId, logFromWeek),
      db.getWorkoutCompletions(gymId),
      db.getMissedDays(gymId),
    ]);

    if (eq.length > 0) equipment = eq;
    if (Object.keys(programs).length > 0) workoutProgram = programs;
    exerciseLog = exerciseLogFromRows(logs);
    completions.forEach((c) => {
      completedWorkouts[`${c.user_id}-${c.week_number}-${c.day_name}`] = {
        type: c.completion_type || 'full',
        loggedSets: c.logged_sets ?? null,
        plannedSets: c.planned_sets ?? null,
      };
    });
    missedRows.forEach((m) => {
      missedWorkouts[`${m.user_id}-${m.week_number}-${m.day_name}`] = {
        reason: m.reason || null,
      };
    });
  }

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
