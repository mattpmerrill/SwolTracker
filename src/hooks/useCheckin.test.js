import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '../test/hookHarness.js';

vi.mock('react', async () => (await import('../test/hookHarness.js')).fakeReact);

const mocks = vi.hoisted(() => ({
  db: {
    getRecentCheckins: vi.fn(),
    getRecentMissedOffers: vi.fn(),
    getWeeklyCheckinSetting: vi.fn(),
    getAllWorkoutPrograms: vi.fn(),
  },
  getCheckinStatus: vi.fn(),
  setWeeklyCheckin: vi.fn(),
  decideCheckin: vi.fn(),
  answerMissedDay: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({ db: mocks.db }));
vi.mock('../lib/checkin', () => ({
  getCheckinStatus: mocks.getCheckinStatus,
  setWeeklyCheckin: mocks.setWeeklyCheckin,
  decideCheckin: mocks.decideCheckin,
  answerMissedDay: mocks.answerMissedDay,
}));

import { useCheckin } from './useCheckin';

const flush = () => new Promise((resolve) => { setTimeout(resolve, 0); });
const FUTURE = new Date(Date.now() + 36 * 3600 * 1000).toISOString();

const pendingRow = (over = {}) => ({
  id: 'c1',
  review_week: 3,
  target_week: 4,
  status: 'pending',
  recap: { headline: 'Solid week', wins: ['Bench PR'], watch: [], tone: 'normal' },
  changes: [
    { id: 'c1', day: 'Monday', summary: 'a', reason: 'b', before: null, after: { exercises: [] } },
    { id: 'c2', day: 'Friday', summary: 'a', reason: 'b', before: null, after: { exercises: [] } },
  ],
  result: null,
  expires_at: FUTURE,
  ...over,
});
const offerRow = (over = {}) => ({
  id: 'o1', week: 3, from_day: 'Tuesday', to_day: 'Saturday', status: 'pending', expires_at: FUTURE, ...over,
});

const toast = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() };
const setWorkoutProgram = vi.fn();
const props = { currentUser: 'u1', programGymId: 'g1', setWorkoutProgram, toast };

const failure = (errorType, message, extra = {}) => Object.assign(new Error(message), { errorType, ...extra });

async function mount(overrides = {}) {
  const view = renderHook(() => useCheckin({ ...props, ...overrides }));
  await flush();
  return view;
}

beforeEach(() => {
  Object.values(mocks.db).forEach((fn) => fn.mockReset());
  mocks.getCheckinStatus.mockReset();
  mocks.setWeeklyCheckin.mockReset();
  mocks.decideCheckin.mockReset();
  mocks.answerMissedDay.mockReset();
  Object.values(toast).forEach((fn) => fn.mockReset());
  setWorkoutProgram.mockReset();
  mocks.db.getRecentCheckins.mockResolvedValue([pendingRow()]);
  mocks.db.getRecentMissedOffers.mockResolvedValue([]);
  mocks.db.getWeeklyCheckinSetting.mockResolvedValue(true);
  mocks.db.getAllWorkoutPrograms.mockResolvedValue({ 1: {}, 4: {} });
  mocks.getCheckinStatus.mockResolvedValue({ eligible: true, enabled: true, configured: true });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useCheckin: loading', () => {
  it('reads the open check-in and offer on mount', async () => {
    mocks.db.getRecentMissedOffers.mockResolvedValue([offerRow()]);
    const view = await mount();
    const { checkin, offer } = view.result.current;
    expect(checkin).toMatchObject({ id: 'c1', headline: 'Solid week', open: true, ackOnly: false });
    expect(offer).toMatchObject({ id: 'o1', title: 'No Tuesday session logged', acceptLabel: 'Move to Saturday' });
    expect(mocks.db.getRecentCheckins).toHaveBeenCalledWith('u1');
    view.unmount();
  });

  it('asks the server for status when the switch is on, or unknown', async () => {
    const view = await mount();
    expect(mocks.getCheckinStatus).toHaveBeenCalledTimes(1);
    expect(view.result.current.status).toEqual({ eligible: true, enabled: true, configured: true });
    view.unmount();

    mocks.getCheckinStatus.mockClear();
    mocks.db.getWeeklyCheckinSetting.mockResolvedValue(null);
    (await mount()).unmount();
    expect(mocks.getCheckinStatus).toHaveBeenCalledTimes(1);
  });

  it('skips the status call for a user who never turned it on', async () => {
    mocks.db.getWeeklyCheckinSetting.mockResolvedValue(false);
    const view = await mount();
    expect(mocks.getCheckinStatus).not.toHaveBeenCalled();
    expect(view.result.current.status).toBeNull();
    view.unmount();
  });

  it('marks check-ins unconfigured on a 503 from status, and keeps status on other errors', async () => {
    mocks.getCheckinStatus.mockRejectedValue(failure('offline', 'Check-ins are off right now.', { status: 503 }));
    const view = await mount();
    expect(view.result.current.status).toMatchObject({ configured: false });
    mocks.getCheckinStatus.mockRejectedValue(failure('network', 'nope'));
    await view.result.current.refreshStatus();
    expect(view.result.current.status).toMatchObject({ configured: false });
    view.unmount();
  });

  it('keeps the old card when a re-read fails', async () => {
    const view = await mount();
    mocks.db.getRecentCheckins.mockResolvedValue(null);
    await view.result.current.refresh();
    expect(view.result.current.checkin?.id).toBe('c1');
    view.unmount();
  });

  it('refreshes when the window regains focus, but not twice in a row', async () => {
    const listeners = {};
    vi.stubGlobal('window', {
      addEventListener: (name, fn) => { listeners[name] = fn; },
      removeEventListener: vi.fn(),
    });
    const view = await mount();
    mocks.db.getRecentCheckins.mockClear();

    listeners.focus();
    expect(mocks.db.getRecentCheckins).not.toHaveBeenCalled(); // just loaded

    const later = Date.now() + 10000;
    vi.spyOn(Date, 'now').mockReturnValue(later);
    listeners.focus();
    expect(mocks.db.getRecentCheckins).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(window.removeEventListener).toHaveBeenCalled();
  });
});

describe('useCheckin: polling', () => {
  it('does not poll on focus for a user with the switch off and nothing waiting', async () => {
    const listeners = {};
    vi.stubGlobal('window', { addEventListener: (name, fn) => { listeners[name] = fn; }, removeEventListener: vi.fn() });
    mocks.db.getWeeklyCheckinSetting.mockResolvedValue(false);
    mocks.db.getRecentCheckins.mockResolvedValue([]);
    const view = await mount();
    mocks.db.getRecentCheckins.mockClear();
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 60000);

    listeners.focus();

    expect(mocks.db.getRecentCheckins).not.toHaveBeenCalled();
    view.unmount();
  });

  it('ticks the clock once a minute while a card is showing, so the expiry label ages', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    mocks.db.getRecentCheckins.mockResolvedValue([pendingRow({ expires_at: new Date(Date.now() + 90 * 60000).toISOString() })]);
    const view = await mount();
    expect(view.result.current.checkin.expiryLabel).toMatch(/^Expires (tonight|\w+ night)$/);

    vi.advanceTimersByTime(60 * 60000); // an hour of minute ticks

    expect(view.result.current.checkin.expiryLabel).toBe('Expires in 30 min');
    view.unmount();
    vi.useRealTimers();
  });
});

describe('useCheckin: decide', () => {
  const applied2 = {
    status: 'partial',
    applied: [{ id: 'c1', day: 'Monday' }],
    skipped: [{ id: 'c2', day: 'Friday', reason: 'already_logged' }],
  };

  it('applies, refreshes the program for the right gym, and toasts the result', async () => {
    mocks.decideCheckin.mockResolvedValue(applied2);
    const view = await mount();
    mocks.db.getRecentCheckins.mockResolvedValue([pendingRow({ status: 'partial', result: { applied: applied2.applied, skipped: applied2.skipped } })]);

    const ok = await view.result.current.decide('c1', ['c1', 'c2']);

    expect(ok).toBe(true);
    expect(mocks.decideCheckin).toHaveBeenCalledWith({ checkinId: 'c1', acceptIds: ['c1', 'c2'] });
    expect(mocks.db.getAllWorkoutPrograms).toHaveBeenCalledWith('g1');
    expect(setWorkoutProgram).toHaveBeenCalledWith({ 1: {}, 4: {} });
    expect(toast.success).toHaveBeenCalledWith('Applied 1. Skipped Friday: you already started it.');
    // The result stays on the card after the row is no longer pending.
    expect(view.result.current.checkin).toMatchObject({ open: false, resultSummary: 'Applied 1. Skipped Friday: you already started it.' });
    expect(view.result.current.busy).toBeNull();
    view.unmount();
  });

  it('does not touch the program when nothing was applied (a skip)', async () => {
    mocks.decideCheckin.mockResolvedValue({ status: 'declined', applied: [], skipped: [] });
    const view = await mount();
    await view.result.current.decide('c1', []);
    expect(mocks.db.getAllWorkoutPrograms).not.toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalledWith('Skipped this week. Nothing changed.');
    view.unmount();
  });

  it('says "Got it" for a check-in with nothing to decide', async () => {
    mocks.db.getRecentCheckins.mockResolvedValue([pendingRow({ changes: [] })]);
    mocks.decideCheckin.mockResolvedValue({ status: 'declined', applied: [], skipped: [] });
    const view = await mount();
    expect(view.result.current.checkin.ackOnly).toBe(true);
    await view.result.current.decide('c1', []);
    expect(toast.info).toHaveBeenCalledWith('Got it. Nothing to change this week.');
    view.unmount();
  });

  it('after a 503, re-reads Supabase and treats an applied row as success', async () => {
    mocks.decideCheckin.mockRejectedValue(failure('offline', "Chad's offline right now. Try again in a bit.", { mayHaveRun: true }));
    const view = await mount();
    mocks.db.getRecentCheckins.mockResolvedValue([
      pendingRow({ status: 'applied', result: { applied: [{ id: 'c1', day: 'Monday' }, { id: 'c2', day: 'Friday' }], skipped: [] } }),
    ]);

    const ok = await view.result.current.decide('c1', ['c1', 'c2']);

    expect(ok).toBe(true);
    expect(view.result.current.error).toBeNull();
    expect(mocks.db.getAllWorkoutPrograms).toHaveBeenCalledWith('g1');
    expect(toast.success).toHaveBeenCalledWith('Applied 2.');
    expect(toast.error).not.toHaveBeenCalled();
    view.unmount();
  });

  it('after a 503 with the row still pending, shows the offline copy and keeps the card', async () => {
    mocks.decideCheckin.mockRejectedValue(failure('offline', "Chad's offline right now. Try again in a bit.", { mayHaveRun: true, status: 503 }));
    const view = await mount();

    const ok = await view.result.current.decide('c1', ['c1']);

    expect(ok).toBe(false);
    expect(view.result.current.error).toEqual({ target: 'checkin', id: 'c1', message: "Chad's offline right now. Try again in a bit." });
    expect(view.result.current.checkin).toMatchObject({ id: 'c1', open: true });
    expect(mocks.db.getAllWorkoutPrograms).not.toHaveBeenCalled();
    expect(view.result.current.busy).toBeNull();
    view.unmount();
  });

  it('after a 409, shows the changed copy and pulls the current state', async () => {
    mocks.decideCheckin.mockRejectedValue(failure('conflict', 'This check-in changed. Pull it up again.', { mayHaveRun: false }));
    const view = await mount();
    mocks.db.getRecentCheckins.mockClear();

    await view.result.current.decide('c1', ['c1']);

    expect(view.result.current.error.message).toBe('This check-in changed. Pull it up again.');
    expect(mocks.db.getRecentCheckins).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it('after a 409 that finds the check-in already applied, shows the stored result', async () => {
    mocks.decideCheckin.mockRejectedValue(failure('conflict', 'This check-in changed. Pull it up again.', { mayHaveRun: false }));
    const view = await mount();
    mocks.db.getRecentCheckins.mockResolvedValue([
      pendingRow({ status: 'applied', result: { applied: [{ id: 'c1', day: 'Monday' }], skipped: [] } }),
    ]);

    await view.result.current.decide('c1', ['c1']);

    expect(view.result.current.checkin).toMatchObject({ open: false, resultSummary: 'Applied 1.' });
    expect(view.result.current.error).toBeNull();
    expect(toast.success).toHaveBeenCalledWith('Applied 1.');
    view.unmount();
  });

  it('after a 409 that finds the check-in expired, says so in a toast', async () => {
    mocks.decideCheckin.mockRejectedValue(failure('conflict', 'This check-in changed. Pull it up again.', { mayHaveRun: false }));
    const view = await mount();
    mocks.db.getRecentCheckins.mockResolvedValue([pendingRow({ status: 'expired' })]);

    await view.result.current.decide('c1', ['c1']);

    expect(toast.info).toHaveBeenCalledWith('This check-in expired. Nothing changed.');
    expect(view.result.current.checkin).toBeNull();
    view.unmount();
  });

  it('ignores a second tap while one decision is in flight', async () => {
    let resolve;
    mocks.decideCheckin.mockReturnValue(new Promise((r) => { resolve = r; }));
    const view = await mount();

    const first = view.result.current.decide('c1', ['c1']);
    expect(view.result.current.busy).toBe('checkin');
    expect(await view.result.current.decide('c1', ['c1'])).toBe(false);
    resolve({ status: 'declined', applied: [], skipped: [] });
    await first;

    expect(mocks.decideCheckin).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it('can dismiss a decided result', async () => {
    mocks.decideCheckin.mockResolvedValue({ status: 'declined', applied: [], skipped: [] });
    const view = await mount();
    mocks.db.getRecentCheckins.mockResolvedValue([pendingRow({ status: 'declined' })]);
    await view.result.current.decide('c1', []);
    expect(view.result.current.checkin).not.toBeNull();
    view.result.current.dismissResult('c1');
    expect(view.result.current.checkin).toBeNull();
    view.unmount();
  });
});

describe('useCheckin: missed-day offer', () => {
  it('moves the workout, refreshes the program and toasts', async () => {
    mocks.db.getRecentMissedOffers.mockResolvedValue([offerRow()]);
    mocks.answerMissedDay.mockResolvedValue({ status: 'accepted', fromDay: 'Tuesday', toDay: 'Saturday' });
    const view = await mount();
    mocks.db.getRecentMissedOffers.mockResolvedValue([offerRow({ status: 'accepted' })]);

    await view.result.current.answerOffer('o1', true);

    expect(mocks.answerMissedDay).toHaveBeenCalledWith({ offerId: 'o1', accept: true });
    expect(mocks.db.getAllWorkoutPrograms).toHaveBeenCalledWith('g1');
    expect(toast.success).toHaveBeenCalledWith('Moved Tuesday to Saturday.');
    expect(view.result.current.offer).toBeNull();
    view.unmount();
  });

  it('skips without touching the program', async () => {
    mocks.db.getRecentMissedOffers.mockResolvedValue([offerRow()]);
    mocks.answerMissedDay.mockResolvedValue({ status: 'declined', fromDay: 'Tuesday', toDay: 'Saturday' });
    const view = await mount();
    await view.result.current.answerOffer('o1', false);
    expect(mocks.db.getAllWorkoutPrograms).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith('Skipped Tuesday this week.');
    view.unmount();
  });

  it('after a 409 that finds the offer expired, tells the user nothing moved', async () => {
    mocks.db.getRecentMissedOffers.mockResolvedValue([offerRow()]);
    mocks.answerMissedDay.mockRejectedValue(failure('conflict', 'That offer changed. Pull it up again.', { mayHaveRun: false }));
    const view = await mount();
    mocks.db.getRecentMissedOffers.mockResolvedValue([offerRow({ status: 'expired' })]);

    expect(await view.result.current.answerOffer('o1', true)).toBe(false);

    expect(toast.warning).toHaveBeenCalledWith("Couldn't move it, that day changed. Nothing moved.");
    expect(view.result.current.offer).toBeNull();
    expect(mocks.db.getAllWorkoutPrograms).not.toHaveBeenCalled();
    view.unmount();
  });

  it('after a 409 with the offer still pending, keeps the card and shows the error inline', async () => {
    mocks.db.getRecentMissedOffers.mockResolvedValue([offerRow()]);
    mocks.answerMissedDay.mockRejectedValue(failure('conflict', 'That offer changed. Pull it up again.', { mayHaveRun: false }));
    const view = await mount();

    await view.result.current.answerOffer('o1', true);

    expect(view.result.current.error).toMatchObject({ target: 'offer', id: 'o1' });
    expect(view.result.current.offer?.id).toBe('o1');
    expect(toast.warning).not.toHaveBeenCalled();
    view.unmount();
  });

  it('after a 503, trusts an accepted row and keeps the offer on a still-pending one', async () => {
    mocks.db.getRecentMissedOffers.mockResolvedValue([offerRow()]);
    mocks.answerMissedDay.mockRejectedValue(failure('offline', "Chad's offline right now.", { mayHaveRun: true }));
    const view = await mount();

    expect(await view.result.current.answerOffer('o1', true)).toBe(false);
    expect(view.result.current.error).toMatchObject({ target: 'offer', id: 'o1' });
    expect(view.result.current.offer?.id).toBe('o1');

    mocks.db.getRecentMissedOffers.mockResolvedValue([offerRow({ status: 'accepted' })]);
    expect(await view.result.current.answerOffer('o1', true)).toBe(true);
    expect(toast.success).toHaveBeenCalledWith('Moved Tuesday to Saturday.');
    expect(mocks.db.getAllWorkoutPrograms).toHaveBeenCalledWith('g1');
    view.unmount();
  });
});

describe('useCheckin: settings switch', () => {
  it('turns the switch on and updates status', async () => {
    mocks.db.getWeeklyCheckinSetting.mockResolvedValue(false);
    mocks.setWeeklyCheckin.mockResolvedValue({ enabled: true });
    const view = await mount();
    mocks.getCheckinStatus.mockResolvedValue({ eligible: true, enabled: false, configured: true });
    await view.result.current.refreshStatus();

    expect(await view.result.current.setEnabled(true)).toBe(true);

    expect(mocks.setWeeklyCheckin).toHaveBeenCalledWith(true);
    expect(view.result.current.status).toMatchObject({ enabled: true, configured: true });
    view.unmount();
  });

  it('toasts a failure and shows the stored switch after a 503', async () => {
    mocks.setWeeklyCheckin.mockRejectedValue(failure('offline', "Chad's offline right now. Try again in a bit.", { mayHaveRun: true }));
    const view = await mount();
    mocks.db.getWeeklyCheckinSetting.mockResolvedValue(false);

    expect(await view.result.current.setEnabled(true)).toBe(false);

    expect(toast.error).toHaveBeenCalledWith("Chad's offline right now. Try again in a bit.");
    expect(view.result.current.status.enabled).toBe(false);
    view.unmount();
  });
});

describe('useCheckin: deep link', () => {
  it('focuses a check-in that is on screen and clears when asked', async () => {
    const view = await mount();
    await view.result.current.showFromLink({ kind: 'checkin', id: 'c1' });
    expect(view.result.current.focusId).toBe('c1');
    view.result.current.clearFocus();
    expect(view.result.current.focusId).toBeNull();
    view.unmount();
  });

  it('drops the focus when the linked card no longer exists', async () => {
    mocks.db.getRecentCheckins.mockResolvedValue([pendingRow({ id: 'c1', status: 'applied' })]);
    const view = await mount();
    await view.result.current.showFromLink({ kind: 'checkin', id: 'c1' });
    expect(view.result.current.focusId).toBeNull();
    await view.result.current.showFromLink({ kind: 'offer', id: 'nope' });
    expect(view.result.current.focusId).toBeNull();
    view.unmount();
  });
});
