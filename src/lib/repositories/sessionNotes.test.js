import { describe, it, expect } from 'vitest';
import { createSessionNotesRepo } from './sessionNotes';
import { createMockSupabase } from '../../test/mockSupabase';

describe('sessionNotesRepo', () => {
  it('getSessionNotes returns legacy-shaped rows', async () => {
    const sb = createMockSupabase();
    sb.respond('session_notes', 'list', {
      data: [{ day_name: 'Monday', label: 'Felt strong', text: 'Felt strong today.' }],
      error: null,
    });
    const repo = createSessionNotesRepo(sb);
    const rows = await repo.getSessionNotes('u1', 3);
    expect(rows).toEqual([{ day: 'Monday', label: 'Felt strong', text: 'Felt strong today.' }]);
  });

  it('upsertSessionNote upserts and returns the row', async () => {
    const sb = createMockSupabase();
    sb.respond('session_notes', 'single', {
      data: { day_name: 'Monday', text: 'Sore knees.' },
      error: null,
    });
    const repo = createSessionNotesRepo(sb);
    const row = await repo.upsertSessionNote('u1', 3, 'Monday', 'Sore knees.', 'soreness');
    expect(row?.text).toBe('Sore knees.');
  });
});
