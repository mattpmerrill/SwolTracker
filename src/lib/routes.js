/**
 * Web URL map for the SPA. Keep tab + overlay paths centralized so nav,
 * deep links, and tests share one source of truth.
 */

export const TAB_IDS = ['workout', 'maxes', 'progress', 'buddies'];

export const ROUTES = {
  root: '/',
  workout: '/workout',
  maxes: '/maxes',
  progress: '/progress',
  buddies: '/buddies',
  settings: '/settings',
  admin: '/admin',
  onboarding: '/onboarding',
};

export const TAB_ROUTES = {
  workout: ROUTES.workout,
  maxes: ROUTES.maxes,
  progress: ROUTES.progress,
  buddies: ROUTES.buddies,
};

/** @returns {'workout'|'maxes'|'progress'|'buddies'|null} */
export function pathToTab(pathname) {
  if (!pathname) return null;
  const normalized = pathname.endsWith('/') && pathname.length > 1
    ? pathname.slice(0, -1)
    : pathname;
  const entry = Object.entries(TAB_ROUTES).find(([, path]) => path === normalized);
  return entry ? entry[0] : null;
}

export function tabToPath(tabId) {
  return TAB_ROUTES[tabId] || ROUTES.workout;
}

export function isSettingsPath(pathname) {
  return normalizePath(pathname) === ROUTES.settings;
}

export function isAdminPath(pathname) {
  return normalizePath(pathname) === ROUTES.admin;
}

function normalizePath(pathname) {
  if (!pathname) return '/';
  if (pathname.endsWith('/') && pathname.length > 1) return pathname.slice(0, -1);
  return pathname;
}
