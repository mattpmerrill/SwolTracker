import { describe, it, expect, vi } from 'vitest';
import { createSocialRepo } from './social';
import { createMockSupabase } from '../../test/mockSupabase';

const deps = () => ({
  getProfile: vi.fn(async (id) => ({ id, name: 'Buddy' })),
  getUserMaxes: vi.fn(async () => ({ Bench: 225 })),
});

describe('socialRepo', () => {
  it('getBuddies returns rpc data', async () => {
    const sb = createMockSupabase();
    sb.respond('rpc.get_buddies', { data: [{ buddy_id: 'b1', name: 'Alex' }], error: null });
    const repo = createSocialRepo(sb, deps());
    const buddies = await repo.getBuddies('u1');
    expect(buddies).toEqual([{ buddy_id: 'b1', name: 'Alex' }]);
  });

  it('sendBuddyRequest inserts and returns the row', async () => {
    const sb = createMockSupabase();
    sb.respond('buddy_requests', 'single', {
      data: { id: 'r1', leader_id: 'u1', member_id: 'u2' },
      error: null,
    });
    const repo = createSocialRepo(sb, deps());
    const req = await repo.sendBuddyRequest('u1', 'u2');
    expect(req?.id).toBe('r1');
  });

  it('getBuddyProfile merges profile + maxes via injected deps', async () => {
    const sb = createMockSupabase();
    const repo = createSocialRepo(sb, deps());
    const result = await repo.getBuddyProfile('b1');
    expect(result).toEqual({ id: 'b1', name: 'Buddy', maxes: { Bench: 225 } });
  });

  it('acceptGroupInvite returns the JSONB payload (success: false is still an object)', async () => {
    const sb = createMockSupabase();
    sb.respond('rpc.accept_group_invite', {
      data: { success: false, error: 'Invalid request or already processed' },
      error: null,
    });
    const repo = createSocialRepo(sb, deps());
    const result = await repo.acceptGroupInvite('req-1', 'u1');
    expect(result).toEqual({ success: false, error: 'Invalid request or already processed' });
  });

  it('acceptGroupInvite returns { success: false } when the rpc errors', async () => {
    const sb = createMockSupabase();
    sb.respond('rpc.accept_group_invite', {
      data: null,
      error: { message: 'forbidden' },
    });
    const repo = createSocialRepo(sb, deps());
    const result = await repo.acceptGroupInvite('req-1', 'u1');
    expect(result).toEqual({ success: false, error: 'forbidden' });
  });
});
