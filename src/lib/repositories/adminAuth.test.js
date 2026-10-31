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

  it('getChadUsage calls the rpc with the window and parses the report', async () => {
    const sb = createMockSupabase();
    sb.respond('rpc.get_chad_usage', {
      data: {
        days: 7,
        totals: { runs: 3, tokens: 1200, cost_usd: 0.0123, active_users: 2, cost_per_active_user: 0.00615 },
        by_instigation: [{ instigation: 'schedule', runs: 3, tokens: 1200, cost_usd: 0.0123, active_users: 2 }],
        top_users: [],
        approval: { applied: 1, partial: 0, declined: 1, expired: 0, open: 1, failed: 0, approval_rate: 0.5 },
        median_hours_to_decision: 5.5,
        reliability: { failures: 0, retries: 1 },
        daily_cost: [{ day: '2026-10-31', cost_usd: 0.0123, tokens: 1200, runs: 3 }],
      },
      error: null,
    });
    const usage = await createAdminAuthRepo(sb).getChadUsage(7);
    expect(sb.rpc).toHaveBeenCalledWith('get_chad_usage', { p_days: 7 });
    expect(usage.totals.runs).toBe(3);
    expect(usage.approval.approval_rate).toBe(0.5);
  });

  it('getChadUsage returns null on an rpc error or a bad shape', async () => {
    const sb = createMockSupabase();
    const repo = createAdminAuthRepo(sb);
    sb.respond('rpc.get_chad_usage', { data: null, error: { message: 'forbidden' } });
    expect(await repo.getChadUsage(30)).toBeNull();
    sb.respond('rpc.get_chad_usage', { data: 'nope', error: null });
    expect(await repo.getChadUsage(30)).toBeNull();
  });
});
