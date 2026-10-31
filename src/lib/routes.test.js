import { describe, it, expect } from 'vitest';
import { pathToTab, tabToPath, isSettingsPath, isAdminPath, parseCheckinLink, ROUTES } from './routes';

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

  it('parses the check-in and offer deep links', () => {
    const id = '0b8f3a52-6c1d-4e8a-9a35-2d1f7c4e9b10';
    expect(parseCheckinLink(`?checkin=${id}`)).toEqual({ kind: 'checkin', id });
    expect(parseCheckinLink(`?offer=${id}`)).toEqual({ kind: 'offer', id });
    expect(parseCheckinLink(`?x=1&checkin=${id.toUpperCase()}`)).toEqual({ kind: 'checkin', id });
  });

  it('ignores a missing, empty or malformed deep link', () => {
    expect(parseCheckinLink('')).toBeNull();
    expect(parseCheckinLink(undefined)).toBeNull();
    expect(parseCheckinLink('?checkin=')).toBeNull();
    expect(parseCheckinLink('?checkin=not-a-uuid')).toBeNull();
    expect(parseCheckinLink('?offer=<script>')).toBeNull();
    expect(parseCheckinLink('?other=1')).toBeNull();
  });
});
