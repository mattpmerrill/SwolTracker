import { describe, it, expect } from 'vitest';
import { createGymsRepo } from './gyms';
import { createMockSupabase } from '../../test/mockSupabase';

describe('gymsRepo', () => {
  it('getMyGyms returns gyms with roles', async () => {
    const sb = createMockSupabase();
    sb.respond('gym_members', 'list', {
      data: [{ gym_id: 'g1', role: 'leader', gyms: { id: 'g1', name: 'Main' } }],
      error: null,
    });
    const repo = createGymsRepo(sb);
    const gyms = await repo.getMyGyms('u1');
    expect(gyms).toEqual([{ id: 'g1', name: 'Main', role: 'leader' }]);
  });

  it('createGym returns id from rpc', async () => {
    const sb = createMockSupabase();
    sb.respond('rpc.create_user_gym', { data: 'gym-123', error: null });
    const repo = createGymsRepo(sb);
    const gym = await repo.createGym('Personal Gym', 'u1');
    expect(gym).toEqual({ id: 'gym-123' });
  });
});
