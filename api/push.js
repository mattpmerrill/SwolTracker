// Web push subscription + test endpoints (slice 9.3).
// Auth via the user's Supabase bearer token; VAPID private key comes from the
// VAPID_PRIVATE_KEY env var (api/_push.js) — never from the browser or the DB.
import { createClient } from '@supabase/supabase-js';
import { setCorsHeaders } from './_mcp-shared.js';
import { configureWebPush, sendToSubscriptions } from './_push.js';

export default async function handler(req, res) {
  setCorsHeaders(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return res.status(500).json({ error: 'Server misconfigured.' });
  const supabase = createClient(url, key);

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing Authorization header.' });
  const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.slice(7));
  if (authError || !user) return res.status(401).json({ error: 'Invalid or expired token.' });

  const { action, subscription, prefs } = req.body ?? {};

  if (action === 'subscribe') {
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return res.status(400).json({ error: 'Invalid subscription.' });
    }
    const row = { user_id: user.id, endpoint: subscription.endpoint, keys: subscription.keys };
    if (prefs) row.prefs = prefs;
    const { error } = await supabase.from('push_subscriptions').upsert(row, { onConflict: 'user_id,endpoint' });
    if (error) return res.status(500).json({ error: 'Failed to save subscription.' });
    return res.status(200).json({ ok: true });
  }

  if (action === 'update-prefs') {
    const { error } = await supabase
      .from('push_subscriptions')
      .update({ prefs, updated_at: new Date().toISOString() })
      .eq('user_id', user.id);
    if (error) return res.status(500).json({ error: 'Failed to update prefs.' });
    return res.status(200).json({ ok: true });
  }

  if (action === 'unsubscribe') {
    if (!subscription?.endpoint) return res.status(200).json({ ok: true });
    const { error } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('user_id', user.id)
      .eq('endpoint', subscription.endpoint);
    if (error) return res.status(500).json({ error: 'Failed to remove subscription.' });
    return res.status(200).json({ ok: true });
  }

  if (action === 'test') {
    const { data: subs, error } = await supabase
      .from('push_subscriptions')
      .select('endpoint, keys')
      .eq('user_id', user.id);
    if (error || !subs?.length) return res.status(200).json({ ok: true, sent: 0 });
    if (!configureWebPush()) return res.status(500).json({ error: 'VAPID not configured.' });
    const sent = await sendToSubscriptions(supabase, subs, {
      title: 'SwolTracker',
      body: 'Notifications are working 💪',
      url: '/',
    });
    return res.status(200).json({ ok: true, sent });
  }

  return res.status(400).json({ error: 'Unknown action.' });
}
