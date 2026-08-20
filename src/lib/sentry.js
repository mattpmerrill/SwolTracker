/**
 * Browser Sentry. No-op unless VITE_SENTRY_DSN is set at build time.
 */
import * as Sentry from '@sentry/browser';

const dsn = import.meta.env.VITE_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.request?.headers) {
        const headers = { ...event.request.headers };
        delete headers.authorization;
        delete headers.Authorization;
        event.request.headers = headers;
      }
      return event;
    },
  });
}

export { Sentry };
