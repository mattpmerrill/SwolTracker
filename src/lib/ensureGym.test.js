import { describe, it, expect, vi } from 'vitest';
import { findOrCreatePersonalGym } from './ensureGym';

const makeDb = ({ gyms = [], created = { id: 'new-gym' } } = {}) => ({
  getMyGyms: vi.fn(async () => gyms),
  createGym: vi.fn(async () => created),
});

describe('findOrCreatePersonalGym', () => {
  it('prefers a gym the user owns over an earlier gym where they are only a member', async () => {
    const db = makeDb({ gyms: [{ id: 'g-group', role: 'member' }, { id: 'g-mine', role: 'owner' }] });
    await expect(findOrCreatePersonalGym(db, 'u1')).resolves.toEqual({ id: 'g-mine' });
    expect(db.getMyGyms).toHaveBeenCalledWith('u1');
    expect(db.createGym).not.toHaveBeenCalled();
  });

  it('falls back to the first gym when the user owns none', async () => {
    const db = makeDb({ gyms: [{ id: 'g-old', role: 'member' }, { id: 'g-newer', role: 'member' }] });
    await expect(findOrCreatePersonalGym(db, 'u1')).resolves.toEqual({ id: 'g-old' });
    expect(db.createGym).not.toHaveBeenCalled();
  });

  it('creates a Personal Gym only when the user has none', async () => {
    const db = makeDb({ gyms: [] });
    await expect(findOrCreatePersonalGym(db, 'u1')).resolves.toEqual({ id: 'new-gym' });
    expect(db.createGym).toHaveBeenCalledTimes(1);
    expect(db.createGym).toHaveBeenCalledWith('Personal Gym', 'u1');
  });

  it('creates when the lookup returns nothing usable', async () => {
    const db = makeDb({ gyms: [{ name: 'no id' }] });
    await findOrCreatePersonalGym(db, 'u1');
    expect(db.createGym).toHaveBeenCalledTimes(1);
  });

  it('passes a createGym failure through so callers can log the cause', async () => {
    const error = new Error('rpc 404');
    const db = makeDb({ gyms: [], created: { id: null, error } });
    await expect(findOrCreatePersonalGym(db, 'u1')).resolves.toEqual({ id: null, error });
  });
});
