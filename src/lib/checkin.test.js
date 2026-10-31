import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'jwt-1' } } }) } },
}));

import { getCheckinStatus, setWeeklyCheckin, decideCheckin, answerMissedDay, reportDayMissed, noteDayMissed } from './checkin';

const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const CHECKIN_ID = '11111111-1111-4111-8111-111111111111';

let fetchMock;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('checkin client', () => {
  it('sends the JWT and the action, and parses the status', async () => {
    fetchMock.mockResolvedValue(json(200, { eligible: true, enabled: false, configured: true }));
    const status = await getCheckinStatus();
    expect(status).toEqual({ eligible: true, enabled: false, configured: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/checkin');
    expect(init.headers.Authorization).toBe('Bearer jwt-1');
    expect(JSON.parse(init.body)).toEqual({ action: 'status' });
  });

  it('setWeeklyCheckin and decideCheckin post their fields', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { enabled: true }));
    expect(await setWeeklyCheckin(true)).toEqual({ enabled: true });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ action: 'settings', enabled: true });

    fetchMock.mockResolvedValueOnce(json(200, {
      status: 'partial',
      applied: [{ id: 'c1', day: 'Monday' }],
      skipped: [{ id: 'c2', day: 'Friday', reason: 'already_logged' }],
    }));
    const result = await decideCheckin({ checkinId: CHECKIN_ID, acceptIds: ['c1', 'c2'] });
    expect(result.status).toBe('partial');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ action: 'decide', checkinId: CHECKIN_ID, acceptIds: ['c1', 'c2'] });
  });

  it('answerMissedDay posts the offer answer and parses the result', async () => {
    fetchMock.mockResolvedValue(json(200, { status: 'accepted', fromDay: 'Tuesday', toDay: 'Saturday' }));
    const result = await answerMissedDay({ offerId: CHECKIN_ID, accept: true });
    expect(result.toDay).toBe('Saturday');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ action: 'missed', offerId: CHECKIN_ID, accept: true });
  });

  it('maps a 409 to the "changed" copy and says it did not run', async () => {
    fetchMock.mockResolvedValue(json(409, { error: 'That one already changed. Pull it up again and take another look.' }));
    const err = await decideCheckin({ checkinId: CHECKIN_ID, acceptIds: [] }).catch((e) => e);
    expect(err.message).toBe('This check-in changed. Pull it up again.');
    expect(err.errorType).toBe('conflict');
    expect(err.mayHaveRun).toBe(false);
  });

  it('uses offer wording for a 409 on a missed-day offer', async () => {
    fetchMock.mockResolvedValue(json(409, { error: 'x' }));
    const err = await answerMissedDay({ offerId: CHECKIN_ID, accept: false }).catch((e) => e);
    expect(err.message).toBe('That offer changed. Pull it up again.');
  });

  it('shows the server copy for a 403 and carries the reason', async () => {
    fetchMock.mockResolvedValue(json(403, { error: 'Only your program owner can use check-ins.', reason: 'group_member' }));
    const err = await setWeeklyCheckin(true).catch((e) => e);
    expect(err.message).toBe('Only your program owner can use check-ins.');
    expect(err.errorType).toBe('not_eligible');
    expect(err.reason).toBe('group_member');
  });

  it('shows the server offline copy for a 503 and flags that it may have run', async () => {
    fetchMock.mockResolvedValue(json(503, { error: "Chad's offline right now. Try again in a bit." }));
    const err = await decideCheckin({ checkinId: CHECKIN_ID, acceptIds: ['c1'] }).catch((e) => e);
    expect(err.message).toBe("Chad's offline right now. Try again in a bit.");
    expect(err.errorType).toBe('offline');
    expect(err.mayHaveRun).toBe(true);
  });

  it('never shows raw text: a long or non-string server error falls back to friendly copy', async () => {
    fetchMock.mockResolvedValue(json(500, { error: 'x'.repeat(500) }));
    const err = await getCheckinStatus().catch((e) => e);
    expect(err.message).toBe('Chad hit a snag. Try again in a moment.');
    fetchMock.mockResolvedValue(json(403, { error: 'y'.repeat(500) }));
    expect((await setWeeklyCheckin(true).catch((e) => e)).message).toBe("Check-ins aren't available for your account.");
  });

  it('treats a network failure as uncertain', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const err = await decideCheckin({ checkinId: CHECKIN_ID, acceptIds: [] }).catch((e) => e);
    expect(err.errorType).toBe('network');
    expect(err.mayHaveRun).toBe(true);
  });

  it('rejects a 200 with the wrong shape', async () => {
    fetchMock.mockResolvedValue(json(200, { status: 'wat' }));
    const err = await decideCheckin({ checkinId: CHECKIN_ID, acceptIds: [] }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.errorType).toBe('default');
    expect(err.mayHaveRun).toBe(true);
  });

  it('reportDayMissed returns queued and swallows every failure', async () => {
    fetchMock.mockResolvedValueOnce(json(202, { queued: true }));
    expect(await reportDayMissed({ week: 3, day: 'Tuesday' })).toBe(true);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ action: 'event', type: 'day_missed', week: 3, day: 'Tuesday' });

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    fetchMock.mockResolvedValueOnce(json(503, { error: 'off' }));
    expect(await reportDayMissed({ week: 3, day: 'Tuesday' })).toBe(false);
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    expect(await reportDayMissed({ week: 3, day: 'Tuesday' })).toBe(false);
    warn.mockRestore();
  });
});

describe('noteDayMissed', () => {
  it('reports the day when the user has the switch on', async () => {
    fetchMock.mockResolvedValue(json(202, { queued: true }));
    const db = { getWeeklyCheckinSetting: vi.fn().mockResolvedValue(true) };
    expect(await noteDayMissed({ db, userId: 'u1', week: 3, day: 'Tuesday' })).toBe(true);
    expect(db.getWeeklyCheckinSetting).toHaveBeenCalledWith('u1');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ action: 'event', week: 3, day: 'Tuesday' });
  });

  it('does not call the API when the switch is off, unknown, or there is no user', async () => {
    for (const setting of [false, null]) {
      const db = { getWeeklyCheckinSetting: vi.fn().mockResolvedValue(setting) };
      expect(await noteDayMissed({ db, userId: 'u1', week: 3, day: 'Tuesday' })).toBe(false);
    }
    expect(await noteDayMissed({ db: { getWeeklyCheckinSetting: vi.fn() }, userId: null, week: 3, day: 'Tuesday' })).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never throws, even when the setting read does', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const db = { getWeeklyCheckinSetting: vi.fn().mockRejectedValue(new Error('boom')) };
    expect(await noteDayMissed({ db, userId: 'u1', week: 3, day: 'Tuesday' })).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
