import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ChadCheckinCard from './ChadCheckinCard';
import ChadMissedDayCard from './ChadMissedDayCard';
import ChadCheckinSettings from './ChadCheckinSettings';
import { buildCheckinView, buildOfferView } from '../../utils/checkinView';

vi.mock('../../lib/push', () => ({ isPushSupported: () => false, getPushEnabled: async () => false }));

const NOW = Date.parse('2026-11-02T04:00:00Z');
const row = (over = {}) => ({
  id: 'c1',
  review_week: 3,
  target_week: 4,
  status: 'pending',
  recap: { headline: 'Solid week, Friday slipped', wins: ['Bench PR'], watch: ['Sleep'], tone: 'normal' },
  changes: [
    { id: 'c1', day: 'Monday', summary: 'Drop squats to 3 sets', reason: 'Fatigue', before: { exercises: [{ name: 'Squat', sets: 4, reps: 5 }] }, after: { exercises: [{ name: 'Squat', sets: 3, reps: 5 }] } },
    { id: 'c2', day: 'Friday', summary: 'Swap rows for pull-ups', reason: 'Elbow', before: null, after: { exercises: [] } },
  ],
  result: null,
  expires_at: '2026-11-03T07:59:59Z',
  ...over,
});

const noop = () => {};
const render = (view, props = {}) => renderToStaticMarkup(
  <ChadCheckinCard view={view} busy={null} error={null} focused={false} onDecide={noop} onTalk={noop} onDismiss={noop} onFocusHandled={noop} {...props} />,
);

describe('ChadCheckinCard', () => {
  it('shows the recap, every change ticked, the expiry and the three actions', () => {
    const html = render(buildCheckinView(row(), { now: NOW, timeZone: 'America/Los_Angeles' }));
    expect(html).toContain('Solid week, Friday slipped');
    expect(html).toContain('Bench PR');
    expect(html).toContain('Sleep');
    expect(html).toContain('Drop squats to 3 sets');
    expect(html).toContain('Expires Monday night');
    expect(html).toContain('Apply 2 changes');
    expect(html).toContain('Talk to Chad about it');
    expect(html).toContain('Skip this week');
    expect(html.match(/type="checkbox"/g)).toHaveLength(2);
    expect(html.match(/checked=""/g)).toHaveLength(2);
    expect(html).toContain('aria-expanded="false"');
  });

  it('offers only "Got it" and Talk to Chad for a quiet week', () => {
    const html = render(buildCheckinView(row({ changes: [] }), { now: NOW }));
    expect(html).toContain('Got it');
    expect(html).toContain('Talk to Chad about it');
    expect(html).not.toContain('Apply');
    expect(html).not.toContain('Skip this week');
  });

  it('shows the result and no actions once decided', () => {
    const decided = row({ status: 'partial', result: { applied: [{ id: 'c1', day: 'Monday' }], skipped: [{ id: 'c2', day: 'Friday', reason: 'already_logged' }] } });
    const html = render(buildCheckinView(decided, { now: NOW }));
    expect(html).toContain('Applied 1. Skipped Friday: you already started it.');
    expect(html).toContain('aria-label="Dismiss check-in"');
    expect(html).not.toContain('Apply');
    expect(html).not.toContain('Expires');
  });

  it('uses the amber warning, not the green check, for a result where nothing was saved', () => {
    const failed = row({ status: 'failed', result: { applied: [], skipped: [{ id: 'c1', day: 'Monday', reason: 'changed_since_draft' }] } });
    const html = render(buildCheckinView(failed, { now: NOW }));
    expect(html).toContain('Nothing was saved.');
    expect(html).toContain('text-amber-400');
    expect(html).not.toContain('text-emerald-400');
  });

  it('keeps the card and shows the error message', () => {
    const html = render(buildCheckinView(row(), { now: NOW }), { error: { target: 'checkin', id: 'c1', message: "Chad's offline right now. Try again in a bit." } });
    expect(html).toContain('role="alert"');
    expect(html).toContain("Chad&#x27;s offline right now. Try again in a bit.");
    expect(html).toContain('Apply 2 changes');
  });

  it('ignores an error that belongs to another card, and disables the buttons while working', () => {
    const view = buildCheckinView(row(), { now: NOW });
    expect(render(view, { error: { target: 'checkin', id: 'other', message: 'nope' } })).not.toContain('role="alert"');
    expect(render(view, { busy: 'checkin' })).toContain('disabled=""');
  });
});

describe('ChadMissedDayCard', () => {
  it('names the day and offers the move or a skip', () => {
    const view = buildOfferView({ id: 'o1', week: 3, from_day: 'Tuesday', to_day: 'Saturday' });
    const html = renderToStaticMarkup(<ChadMissedDayCard view={view} busy={null} error={null} focused={false} onAnswer={noop} onFocusHandled={noop} />);
    expect(html).toContain('No Tuesday session logged');
    expect(html).toContain('Move to Saturday');
    expect(html).toContain('Skip it this week');
  });
});

describe('ChadCheckinSettings', () => {
  const settings = (status) => renderToStaticMarkup(
    <ChadCheckinSettings checkin={{ status, saving: false, onSetEnabled: noop, onRefreshStatus: noop }} />,
  );

  it('renders nothing until the server has check-ins set up', () => {
    expect(settings(null)).toBe('');
    expect(settings({ configured: false, eligible: false, enabled: false })).toBe('');
  });

  it('shows an orange switch for an eligible user', () => {
    const html = settings({ configured: true, eligible: true, enabled: true });
    expect(html).toContain('Weekly check-in with Chad');
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('bg-orange-500');
  });

  it('explains instead of switching for a group member', () => {
    const html = settings({ configured: true, eligible: false, reason: 'group_member', enabled: false });
    expect(html).toContain('Only your program owner can use check-ins.');
    expect(html).not.toContain('role="switch"');
  });
});
