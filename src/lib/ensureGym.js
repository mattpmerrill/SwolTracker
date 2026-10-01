/**
 * Onboarding must not mint a second personal gym for someone who already has one
 * (a retry, a second device, or an agent that got there first). Look the user's gyms
 * up through the repository and reuse one, and only create when there is none.
 *
 * Preference: a gym the user owns (role 'owner', the personal gym), else the first gym
 * (the oldest membership, see `getMyGyms`), else create. Preferring an owned gym keeps
 * onboarding out of someone else's shared program whenever the user has a gym of their own.
 * A user who is only a member somewhere reuses that membership rather than getting a second
 * gym; no production user was in that state on 2026-10-01.
 *
 * @param {{ getMyGyms: (userId: string) => Promise<Array<{ id?: string, role?: string }>>,
 *           createGym: (name: string, userId: string) => Promise<{ id: string | null, error?: unknown }> }} db
 * @param {string} userId
 * @returns {Promise<{ id: string | null, error?: unknown }>} same shape as `db.createGym`
 */
export async function findOrCreatePersonalGym(db, userId) {
  const gyms = await db.getMyGyms(userId);
  const usable = Array.isArray(gyms) ? gyms.filter((g) => g?.id) : [];
  const existing = usable.find((g) => g.role === 'owner') ?? usable[0];
  if (existing) return { id: existing.id };
  return db.createGym('Personal Gym', userId);
}
