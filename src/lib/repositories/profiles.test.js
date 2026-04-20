import { describe, it, expect } from 'vitest';
import { createProfilesRepo } from './profiles';
import { createMockSupabase } from '../../test/mockSupabase';

describe('profilesRepo', () => {
  it('getProfile returns the row for the given userId', async () => {
    const sb = createMockSupabase();
    sb.respond('profiles', 'single', { data: { id: 'u1', name: 'Matt' }, error: null });
    const repo = createProfilesRepo(sb);
    const profile = await repo.getProfile('u1');
    expect(profile).toEqual({ id: 'u1', name: 'Matt' });
    expect(sb.calls[0]).toEqual(['profiles', 'from', []]);
  });

  it('updateProfile returns the updated row', async () => {
    const sb = createMockSupabase();
    sb.respond('profiles', 'single', { data: { id: 'u1', name: 'Updated' }, error: null });
    const repo = createProfilesRepo(sb);
    const result = await repo.updateProfile('u1', { name: 'Updated' });
    expect(result).toEqual({ id: 'u1', name: 'Updated' });
  });
});
