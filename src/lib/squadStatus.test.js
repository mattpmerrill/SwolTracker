import { describe, it, expect } from 'vitest';
import { buildSquadStatuses } from './squadStatus';

describe('buildSquadStatuses', () => {
  it('returns empty for a solo independent user', () => {
    expect(buildSquadStatuses({
      currentUserId: 'u1',
      userName: 'Matt',
      groupRole: 'independent',
      groupMembers: [],
      week: 3,
      day: 'Monday',
      isWorkoutComplete: () => true,
      isWorkoutMissed: () => false,
    })).toEqual([]);
  });

  it('lists leader + members with done / skipped / due for today', () => {
    const roster = buildSquadStatuses({
      currentUserId: 'matt',
      userName: 'Matt',
      groupRole: 'leader',
      groupMembers: [
        { member_id: 'wren', member_name: 'Wren' },
        { member_id: 'chase', member_name: 'Chase' },
      ],
      week: 8,
      day: 'Monday',
      isWorkoutComplete: (_w, _d, id) => id === 'matt',
      isWorkoutMissed: (_w, _d, id) => id === 'chase',
    });
    expect(roster).toEqual([
      { id: 'matt', name: 'Matt', status: 'done' },
      { id: 'wren', name: 'Wren', status: 'due' },
      { id: 'chase', name: 'Chase', status: 'skipped' },
    ]);
  });

  it('includes the leader when the viewer is a member', () => {
    const roster = buildSquadStatuses({
      currentUserId: 'wren',
      userName: 'Wren',
      groupRole: 'member',
      groupLeader: { id: 'matt', name: 'Matt' },
      groupMembers: [],
      week: 8,
      day: 'Tuesday',
      isWorkoutComplete: () => false,
      isWorkoutMissed: () => false,
    });
    expect(roster.map((p) => p.id)).toEqual(['wren', 'matt']);
  });
});
