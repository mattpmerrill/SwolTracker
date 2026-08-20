/**
 * Build a Today roster from group state + already-hydrated completions/misses.
 * No extra fetches. Independent solo users get an empty list (hide the strip).
 */
export function buildSquadStatuses({
  currentUserId,
  userName,
  groupRole,
  groupLeader,
  groupMembers = [],
  week,
  day,
  isWorkoutComplete,
  isWorkoutMissed,
}) {
  const roster = [];
  const seen = new Set();

  const add = (id, name) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    let status = 'due';
    if (isWorkoutComplete?.(week, day, id)) status = 'done';
    else if (isWorkoutMissed?.(week, day, id)) status = 'skipped';
    roster.push({ id, name: name || 'Athlete', status });
  };

  add(currentUserId, userName);
  if (groupLeader?.id) add(groupLeader.id, groupLeader.name);
  (groupMembers || []).forEach((member) => {
    add(member.member_id || member.id, member.member_name || member.name);
  });

  const inGroup = groupRole === 'leader' || groupRole === 'member' || groupMembers.length > 0;
  if (!inGroup || roster.length < 2) return [];
  return roster;
}
