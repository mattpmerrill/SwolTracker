import { describe, it, expect } from 'vitest';

/**
 * Pure helper tests for post-workout note composition (mirrors PostWorkoutCoachPrompt).
 * Kept free of React so vitest stays fast without a DOM env.
 */
function buildPostWorkoutMessage({ week, day, focusLabel, body }) {
  const text = (body || '').trim();
  if (!text) return null;
  const header = focusLabel
    ? `Post-workout note — Week ${week} ${day} (${focusLabel}):`
    : `Post-workout note — Week ${week} ${day}:`;
  return `${header}\n${text}`;
}

describe('post-workout coach note composition', () => {
  it('returns null for empty body', () => {
    expect(buildPostWorkoutMessage({ week: 3, day: 'Monday', body: '  ' })).toBeNull();
  });

  it('includes week, day, and focus', () => {
    const msg = buildPostWorkoutMessage({
      week: 12,
      day: 'Thursday',
      focusLabel: 'Upper Body',
      body: 'Felt strong',
    });
    expect(msg).toContain('Week 12 Thursday (Upper Body)');
    expect(msg).toContain('Felt strong');
  });

  it('works without focus label', () => {
    const msg = buildPostWorkoutMessage({ week: 1, day: 'Friday', body: 'Low energy' });
    expect(msg).toBe('Post-workout note — Week 1 Friday:\nLow energy');
  });
});
