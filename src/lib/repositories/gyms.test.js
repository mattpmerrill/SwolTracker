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

  it('addEquipment returns the inserted row', async () => {
    const sb = createMockSupabase();
    sb.respond('gym_equipment', 'single', {
      data: { id: 'e1', gym_id: 'g1', name: 'Cable machine' },
      error: null,
    });
    const repo = createGymsRepo(sb);
    const row = await repo.addEquipment('g1', 'Cable machine');
    expect(row?.name).toBe('Cable machine');
  });

  it('addEquipment returns null on error', async () => {
    const sb = createMockSupabase();
    sb.respond('gym_equipment', 'single', {
      data: null,
      error: { message: 'duplicate' },
    });
    const repo = createGymsRepo(sb);
    const row = await repo.addEquipment('g1', 'Barbell');
    expect(row).toBeNull();
  });

  it('removeEquipment returns true on success and false on error', async () => {
    const sb = createMockSupabase();
    // delete().eq()... is awaited as a thenable chain → terminator is "list"
    sb.respond('gym_equipment', 'list', { data: null, error: null });
    const repo = createGymsRepo(sb);
    await expect(repo.removeEquipment('g1', 'Barbell')).resolves.toBe(true);

    sb.respond('gym_equipment', 'list', { data: null, error: { message: 'boom' } });
    await expect(repo.removeEquipment('g1', 'Barbell')).resolves.toBe(false);
  });
});
