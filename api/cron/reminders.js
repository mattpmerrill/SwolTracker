// Daily workout reminder push (slice 9.4). Triggered by Vercel Cron.
// Auth: Vercel sends `Authorization: Bearer ${CRON_SECRET}` on cron calls.
import { createClient } from '@supabase/supabase-js';
import { calculateCurrentWeek } from '../../mcp/dist/shared/week-math.js';
import { configureWebPush, sendToSubscriptions } from '../_push.js';
import { localNow, reminderDecision, reminderPayload } from '../_reminders.js';

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(500).json({ error: 'CRON_SECRET not configured.' });
  if (req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }
  if (!configureWebPush()) return res.status(500).json({ error: 'VAPID not configured.' });

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return res.status(500).json({ error: 'Server misconfigured.' });
  const supabase = createClient(url, key);

  const today = localNow();
  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('user_id, endpoint, keys, prefs, last_reminded_on');
  if (error) return res.status(500).json({ error: 'Failed to load subscriptions.' });

  const byUser = new Map();
  for (const s of subs ?? []) {
    if (!byUser.has(s.user_id)) byUser.set(s.user_id, []);
    byUser.get(s.user_id).push(s);
  }

  const results = [];
  for (const [userId, devices] of byUser) {
    try {
      const prefs = devices[0].prefs ?? {};
      const lastRemindedOn = devices.map((d) => d.last_reminded_on).filter(Boolean).sort().pop() ?? null;

      const [{ data: profile }, { data: membership }] = await Promise.all([
        supabase.from('profiles').select('program_start_date').eq('id', userId).single(),
        supabase.from('gym_members').select('gym_id').eq('user_id', userId).order('joined_at', { ascending: true }).limit(1),
      ]);
      const gymId = membership?.[0]?.gym_id;
      if (!gymId || !profile?.program_start_date) {
        results.push({ send: false, reason: 'no_program' });
        continue;
      }
      const week = calculateCurrentWeek(profile.program_start_date);

      const [{ data: program }, { count: loggedSets }, { count: completedCount }, { count: missedCount }] = await Promise.all([
        supabase.from('workout_programs').select('program_data').eq('gym_id', gymId).eq('week_number', week).maybeSingle(),
        supabase.from('workout_logs').select('id', { count: 'exact', head: true })
          .eq('user_id', userId).eq('week_number', week).eq('day_name', today.dayName).eq('completed', true),
        supabase.from('workout_completions').select('id', { count: 'exact', head: true })
          .eq('user_id', userId).eq('week_number', week).eq('day_name', today.dayName),
        supabase.from('missed_days').select('id', { count: 'exact', head: true })
          .eq('user_id', userId).eq('week_number', week).eq('day_name', today.dayName),
      ]);

      const dayPlan = program?.program_data?.[today.dayName] ?? null;
      const decision = reminderDecision({
        prefs,
        lastRemindedOn,
        today,
        dayPlan,
        loggedSets: loggedSets ?? 0,
        completed: (completedCount ?? 0) > 0,
        missed: (missedCount ?? 0) > 0,
      });

      if (decision.send) {
        const sent = await sendToSubscriptions(supabase, devices, reminderPayload(dayPlan));
        if (sent > 0) {
          await supabase.from('push_subscriptions').update({ last_reminded_on: today.date }).eq('user_id', userId);
        }
        results.push({ ...decision, sent });
      } else {
        results.push(decision);
      }
    } catch (e) {
      console.error('reminder failed', e?.message);
      results.push({ send: false, reason: 'error' });
    }
  }

  const sent = results.filter((r) => r.sent > 0).length;
  return res.status(200).json({ ok: true, date: today.date, day: today.dayName, users: results.length, sent, reasons: results.map((r) => r.reason) });
}
