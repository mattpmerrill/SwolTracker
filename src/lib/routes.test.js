import { describe, it, expect } from 'vitest';
import { pathToTab, tabToPath, isSettingsPath, isAdminPath, ROUTES } from './routes';

describe('routes', () => {
  it('pathToTab maps tab paths', () => {
    expect(pathToTab('/workout')).toBe('workout');
    expect(pathToTab('/maxes')).toBe('maxes');
    expect(pathToTab('/progress')).toBe('progress');
    expect(pathToTab('/buddies')).toBe('buddies');
    expect(pathToTab('/workout/')).toBe('workout');
  });

  it('pathToTab returns null for overlays and unknown paths', () => {
    expect(pathToTab('/settings')).toBeNull();
    expect(pathToTab('/admin')).toBeNull();
    expect(pathToTab('/nope')).toBeNull();
  });

  it('tabToPath maps tabs', () => {
    expect(tabToPath('maxes')).toBe(ROUTES.maxes);
    expect(tabToPath('unknown')).toBe(ROUTES.workout);
  });

  it('detects settings and admin overlay paths', () => {
    expect(isSettingsPath('/settings')).toBe(true);
    expect(isSettingsPath('/settings/')).toBe(true);
    expect(isSettingsPath('/workout')).toBe(false);
    expect(isAdminPath('/admin')).toBe(true);
    expect(isAdminPath('/admin/')).toBe(true);
    expect(isAdminPath('/settings')).toBe(false);
  });
});
