import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '../test/hookHarness.js';

vi.mock('react', async () => (await import('../test/hookHarness.js')).fakeReact);

const auth = vi.hoisted(() => ({
  emit: null,
  getSession: null,
  unsubscribe: null,
  signOut: null,
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => auth.getSession(),
      onAuthStateChange: (cb) => {
        auth.emit = cb;
        return { data: { subscription: { unsubscribe: auth.unsubscribe } } };
      },
      signOut: () => auth.signOut(),
    },
  },
}));

import { reconcileAuthUser, useSession } from './useSession';

const flush = () => new Promise((resolve) => { setTimeout(resolve, 0); });

beforeEach(() => {
  auth.emit = null;
  auth.unsubscribe = vi.fn();
  auth.signOut = vi.fn().mockResolvedValue(undefined);
  auth.getSession = vi.fn().mockResolvedValue({
    data: { session: { user: { id: 'u1', email: 'a@x.com', token: 'one' } } },
  });
});

describe('reconcileAuthUser', () => {
  it('keeps the previous object for the same user id', () => {
    const prev = { id: 'u1', n: 1 };
    expect(reconcileAuthUser(prev, { id: 'u1', n: 2 })).toBe(prev);
  });

  it('takes the new user when the id differs or there was none', () => {
    const next = { id: 'u2' };
    expect(reconcileAuthUser({ id: 'u1' }, next)).toBe(next);
    expect(reconcileAuthUser(null, next)).toBe(next);
  });

  it('is null on sign-out', () => {
    expect(reconcileAuthUser({ id: 'u1' }, null)).toBeNull();
  });
});

describe('useSession', () => {
  it('keeps the same authUser object when a token refresh delivers the same user id', async () => {
    const view = renderHook(() => useSession());
    await flush();
    const original = view.result.current.authUser;
    expect(original.id).toBe('u1');
    expect(view.result.current.authLoading).toBe(false);

    auth.emit('TOKEN_REFRESHED', { user: { id: 'u1', email: 'a@x.com', token: 'two' } });
    auth.emit('SIGNED_IN', { user: { id: 'u1', email: 'a@x.com', token: 'three' } });
    expect(view.result.current.authUser).toBe(original);
    view.unmount();
  });

  it('updates when a different user signs in, and clears on sign-out', async () => {
    const view = renderHook(() => useSession());
    await flush();
    const first = view.result.current.authUser;

    const second = { id: 'u2', email: 'b@x.com' };
    auth.emit('SIGNED_IN', { user: second });
    expect(view.result.current.authUser).toBe(second);
    expect(view.result.current.authUser).not.toBe(first);

    auth.emit('SIGNED_OUT', null);
    expect(view.result.current.authUser).toBeNull();
    view.unmount();
    expect(auth.unsubscribe).toHaveBeenCalled();
  });

  it('signOut clears the user', async () => {
    const view = renderHook(() => useSession());
    await flush();
    await view.result.current.signOut();
    expect(auth.signOut).toHaveBeenCalled();
    expect(view.result.current.authUser).toBeNull();
    view.unmount();
  });
});
