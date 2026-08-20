/**
 * Server Sentry for Vercel functions. No-op unless SENTRY_DSN is set.
 * Strips Authorization / Cookie before send.
 */
import * as Sentry from '@sentry/node';

let inited = false;

function scrub(event) {
  if (event.request?.headers) {
    const headers = { ...event.request.headers };
    delete headers.authorization;
    delete headers.Authorization;
    delete headers.cookie;
    delete headers.Cookie;
    event.request.headers = headers;
  }
  return event;
}

export function initSentry() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn || inited) return false;
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'production',
    sendDefaultPii: false,
    beforeSend: scrub,
  });
  inited = true;
  return true;
}

export function captureException(error, context = {}) {
  if (!process.env.SENTRY_DSN) return;
  initSentry();
  Sentry.captureException(error, context);
}
