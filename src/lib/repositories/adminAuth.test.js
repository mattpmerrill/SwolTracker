import { describe, it, expect, vi } from 'vitest';
import { createAdminAuthRepo } from './adminAuth';
import { createMockSupabase } from '../../test/mockSupabase';

describe('adminAuthRepo', () => {
  it('isAdmin returns true when the rpc returns true', async () => {
    const sb = createMockSupabase();
    sb.respond('rpc.is_admin', { data: true, error: null });
    const repo = createAdminAuthRepo(sb);
    expect(await repo.isAdmin('u1')).toBe(true);
  });

  it('isAdmin returns false on rpc error', async () => {
    const sb = createMockSupabase();
    sb.respond('rpc.is_admin', { data: null, error: { message: 'denied' } });
    const repo = createAdminAuthRepo(sb);
    expect(await repo.isAdmin('u1')).toBe(false);
  });

  it('getAllUsers uses the authenticated user id', async () => {
    const sb = createMockSupabase();
    sb.auth = { getUser: vi.fn(async () => ({ data: { user: { id: 'admin-1' } } })) };
    sb.respond('rpc.get_all_users', { data: [{ id: 'u1' }, { id: 'u2' }], error: null });
    const repo = createAdminAuthRepo(sb);
    const users = await repo.getAllUsers();
    expect(users).toHaveLength(2);
  });
});
