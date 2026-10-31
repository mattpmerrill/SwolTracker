/**
 * Web URL map for the SPA. Keep tab + overlay paths centralized so nav,
 * deep links, and tests share one source of truth.
 */

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

const TAB_ROUTES = {
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The check-in deep link carried by Chad's pushes: /workout?checkin=<id> or /workout?offer=<id>
 * (shared/checkin-contract.ts). Anything that is not a uuid is ignored, so a mangled link is
 * a plain /workout visit.
 * @param {string} search - location.search
 * @returns {{ kind: 'checkin' | 'offer', id: string } | null}
 */
export function parseCheckinLink(search) {
  if (!search) return null;
  const params = new URLSearchParams(search);
  for (const kind of ['checkin', 'offer']) {
    const id = params.get(kind);
    if (id && UUID_RE.test(id)) return { kind, id: id.toLowerCase() };
  }
  return null;
}
