import { useEffect, useState } from 'react';
import { db } from '../lib/supabase';
import { calculateCurrentWeek } from '../utils/date';

/**
 * One-shot bootstrap that turns an authenticated user into a fully loaded
 * app state bundle. Called once when authUser arrives. Returns a loading
 * flag, an onboarding signal, and the data bundle to hydrate app state with.
 *
 * Consumers wire the returned bundle into their local state via a single
 * effect; we do not own the state here.
 */
export function useAppBootstrap(authUser) {
  const [isLoading, setIsLoading] = useState(true);
  const [bundle, setBundle] = useState(null);
  const [onboarding, setOnboarding] = useState(null);

  useEffect(() => {
    if (!authUser) {
      setIsLoading(false);
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
  }, [authUser]);

  return { isLoading, bundle, onboarding };
}

async function loadUserBundle(authUser) {
  const userId = authUser.id;

  const profile = await db.getProfile(userId);
  if (!profile?.onboarding_completed) {
    return {
      kind: 'onboarding',
      onboardingData: {
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
  } else if (groupRoleData.role === 'leader' && groupRoleData.member_count > 0) {
    groupMembers = await db.getGroupMembers(userId);
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

    const logs = await db.getAllWorkoutLogs(gymId);
    logs.forEach((l) => {
      const key = `${l.user_id}-${l.week_number}-${l.day_name}-${l.exercise_index}-${l.set_index}`;
      exerciseLog[key] = { completed: l.completed, actualWeight: l.actual_weight, actualReps: l.actual_reps };
    });

    const completions = await db.getWorkoutCompletions(gymId);
    completions.forEach((c) => {
      completedWorkouts[`${c.user_id}-${c.week_number}-${c.day_name}`] = true;
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
    hasUnreadAgentMessages: unreadAgent,
    latestCoachNote: coachNote,
    hasAgentKey: agentKey,
  };
}
