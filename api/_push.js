// Shared web-push helpers for api/push.js and api/cron/reminders.js.
// VAPID private key lives ONLY in the Vercel env var VAPID_PRIVATE_KEY.
import webPush from 'web-push';

export const VAPID_SUBJECT = 'mailto:joi@getlatest.ai';
export const VAPID_PUBLIC_KEY = 'BJ5OIQ2Y68gLAv5utqitxHjTWtydi7Gl0RF8bFn6q0R6u1sFp589ij9VUeXrh2dQU7UPysAk20VeKOq213rEdCM';

let configured = false;

/** Returns false when VAPID_PRIVATE_KEY is not set. */
export function configureWebPush(env = process.env) {
  if (configured) return true;
  const privateKey = env.VAPID_PRIVATE_KEY;
  if (!privateKey) return false;
  webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, privateKey);
  configured = true;
  return true;
}

/**
 * Send one payload to a list of { endpoint, keys } rows. Dead subscriptions
 * (404/410) are deleted. Returns the number delivered.
 */
export async function sendToSubscriptions(supabase, subs, payload) {
  const body = JSON.stringify(payload);
  let sent = 0;
  for (const sub of subs) {
    try {
      await webPush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, body);
      sent += 1;
    } catch (e) {
      if (e?.statusCode === 404 || e?.statusCode === 410) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
      } else {
        console.error('push send failed', e?.statusCode, e?.body || e?.message);
      }
    }
  }
  return sent;
}
