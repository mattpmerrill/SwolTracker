import { supabase } from './supabase';

export const VAPID_PUBLIC_KEY =
  'BJ5OIQ2Y68gLAv5utqitxHjTWtydi7Gl0RF8bFn6q0R6u1sFp589ij9VUeXrh2dQU7UPysAk20VeKOq213rEdCM';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) output[i] = rawData.charCodeAt(i);
  return output;
}

export function subscriptionMatchesKey(subscription, publicKey = VAPID_PUBLIC_KEY) {
  const current = subscription?.options?.applicationServerKey;
  if (!current) return true; // browser doesn't expose it; assume fine
  const a = new Uint8Array(current);
  const b = urlBase64ToUint8Array(publicKey);
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

export function isPushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}

async function post(action, body = {}) {
  const token = await getAccessToken();
  if (!token) return { ok: false, error: 'auth' };
  try {
    const res = await fetch('/api/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, ...body }),
    });
    return { ok: res.ok, error: res.ok ? null : 'request-failed' };
  } catch {
    return { ok: false, error: 'network' };
  }
}

export async function getPushEnabled() {
  if (!isPushSupported()) return false;
  if (Notification.permission !== 'granted') return false;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  return !!subscription && subscriptionMatchesKey(subscription);
}

export async function subscribeToPush() {
  if (!isPushSupported()) return { ok: false, error: 'not-supported' };
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return { ok: false, error: 'denied' };
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    // After a VAPID key rotation the browser still holds a subscription tied
    // to the old key; it can't be reused, so drop it and subscribe fresh.
    if (subscription && !subscriptionMatchesKey(subscription)) {
      await subscription.unsubscribe();
      subscription = null;
    }
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    return post('subscribe', { subscription: subscription.toJSON() });
  } catch (e) {
    return { ok: false, error: e?.message || 'unknown' };
  }
}

export async function unsubscribeFromPush() {
  if (!isPushSupported()) return { ok: false, error: 'not-supported' };
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) await subscription.unsubscribe();
    return post('unsubscribe', { subscription: subscription ? subscription.toJSON() : null });
  } catch {
    return { ok: false, error: 'unknown' };
  }
}

export async function testPush() {
  return post('test');
}
