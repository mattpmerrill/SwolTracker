// Web push subscription + test endpoints (slice 9.3).
// Auth via the user's Supabase bearer token; VAPID private key is read from
// app_settings (same secret store as the LLM keys) — never from the browser.
import { createClient } from '@supabase/supabase-js';
import webPush from 'web-push';
import { setCorsHeaders } from './_mcp-shared.js';

const VAPID_SUBJECT = 'mailto:joi@getlatest.ai';
const VAPID_PUBLIC_KEY = 'BPTumv1BQ3UFYWo4muculTOVfUzdPguNNY2dSPn-1gzgk4vb1pTb1AtsrHeV622sB5hsQLoWaELvnB73bGpjkdM';

async function getVapidPrivateKey(supabase) {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'vapid_private_key')
    .single();
  if (error || !data) return null;
  return data.value;
}

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
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(
        { user_id: user.id, endpoint: subscription.endpoint, keys: subscription.keys, prefs },
        { onConflict: 'user_id,endpoint' },
      );
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
    const { error } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('user_id', user.id)
      .eq('endpoint', subscription?.endpoint);
    if (error) return res.status(500).json({ error: 'Failed to remove subscription.' });
    return res.status(200).json({ ok: true });
  }

  if (action === 'test') {
    const { data: subs, error } = await supabase
      .from('push_subscriptions')
      .select('endpoint, keys')
      .eq('user_id', user.id);
    if (error || !subs?.length) return res.status(200).json({ ok: true, sent: 0 });
    const privateKey = await getVapidPrivateKey(supabase);
    if (!privateKey) return res.status(500).json({ error: 'VAPID not configured.' });
    webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, privateKey);
    const payload = JSON.stringify({ title: 'SwolTracker', body: 'Notifications are working 💪', url: '/' });
    let sent = 0;
    for (const sub of subs) {
      try {
        await webPush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload);
        sent += 1;
      } catch (e) {
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        }
      }
    }
    return res.status(200).json({ ok: true, sent });
  }

  return res.status(400).json({ error: 'Unknown action.' });
}
