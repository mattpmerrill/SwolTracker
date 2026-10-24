import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '../test/hookHarness.js';

vi.mock('react', async () => (await import('../test/hookHarness.js')).fakeReact);

const db = vi.hoisted(() => ({ getProfile: null }));
vi.mock('../lib/supabase', () => ({
  db: { getProfile: (...args) => db.getProfile(...args) },
}));

import { shouldShowBootstrapLoading, useAppBootstrap } from './useAppBootstrap';

const flush = () => new Promise((resolve) => { setTimeout(resolve, 0); });

beforeEach(() => {
  // Not onboarded: the bundle load stops after one call, which is all we count.
  db.getProfile = vi.fn().mockResolvedValue({ onboarding_completed: false });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('useAppBootstrap reload behavior', () => {
  it('does not reload when the auth client hands over a new object for the same user', async () => {
    const view = renderHook((user) => useAppBootstrap(user), { id: 'u1', email: 'a@x.com' });
    await flush();
    expect(db.getProfile).toHaveBeenCalledTimes(1);
    expect(view.result.current.isLoading).toBe(false);
    expect(view.result.current.onboarding.id).toBe('u1');

    view.rerender({ id: 'u1', email: 'a@x.com', refreshed: true });
    await flush();
    expect(db.getProfile).toHaveBeenCalledTimes(1);
    expect(view.result.current.isLoading).toBe(false);
    view.unmount();
  });

  it('reloads for a different user and clears state on sign-out', async () => {
    const view = renderHook((user) => useAppBootstrap(user), { id: 'u1', email: 'a@x.com' });
    await flush();

    view.rerender({ id: 'u2', email: 'b@x.com' });
    await flush();
    expect(db.getProfile).toHaveBeenCalledTimes(2);
    expect(db.getProfile).toHaveBeenLastCalledWith('u2');
    expect(view.result.current.onboarding.id).toBe('u2');

    view.rerender(null);
    await flush();
    expect(view.result.current.onboarding).toBeNull();
    expect(view.result.current.bundle).toBeNull();
    expect(view.result.current.isLoading).toBe(false);
    view.unmount();
  });

  it('reload() still triggers a fresh load', async () => {
    const view = renderHook((user) => useAppBootstrap(user), { id: 'u1', email: 'a@x.com' });
    await flush();
    view.result.current.reload();
    await flush();
    expect(db.getProfile).toHaveBeenCalledTimes(2);
    view.unmount();
  });
});

describe('shouldShowBootstrapLoading', () => {
  const user = { id: 'u1' };

  it('shows while auth is resolving', () => {
    expect(shouldShowBootstrapLoading({ authLoading: true, authUser: null, isLoading: false, bundle: null })).toBe(true);
  });

  it('shows on the first load for a signed-in user', () => {
    expect(shouldShowBootstrapLoading({ authLoading: false, authUser: user, isLoading: true, bundle: null })).toBe(true);
  });

  it('does not show when signed out or finished loading', () => {
    expect(shouldShowBootstrapLoading({ authLoading: false, authUser: null, isLoading: true, bundle: null })).toBe(false);
    expect(shouldShowBootstrapLoading({ authLoading: false, authUser: user, isLoading: false, bundle: null })).toBe(false);
  });

  it('keeps the app mounted during a background reload of the same user', () => {
    expect(shouldShowBootstrapLoading({ authLoading: false, authUser: user, isLoading: true, bundle: { userId: 'u1' } })).toBe(false);
  });

  it('never shows another user\'s bundle while a new user loads', () => {
    expect(shouldShowBootstrapLoading({ authLoading: false, authUser: { id: 'u2' }, isLoading: true, bundle: { userId: 'u1' } })).toBe(true);
  });
});
