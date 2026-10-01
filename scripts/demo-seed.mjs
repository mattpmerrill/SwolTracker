#!/usr/bin/env node
/**
 * Seed the SwolTracker demo account with realistic fake data.
 *
 * Acts ONLY as the demo user: signs in with the anon key + password, so RLS
 * applies to every read and write. Program, logs, maxes and Coach Board notes
 * go through the same MCP endpoint an external agent would use, with a
 * short-lived `swol_` key minted by the demo user and revoked at the end.
 *
 * Idempotent: every step checks what already exists and skips it.
 *
 * Usage:
 *   DEMO_EMAIL=demo@example.com DEMO_PASSWORD=... \
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... \
 *   node scripts/demo-seed.mjs --yes
 *
 * Env:
 *   DEMO_EMAIL, DEMO_PASSWORD   required (email must end in @example.com)
 *   SUPABASE_URL                defaults to VITE_SUPABASE_URL
 *   SUPABASE_ANON_KEY           defaults to VITE_SUPABASE_ANON_KEY
 *   MCP_URL                     defaults to https://swol-tracker.vercel.app/api/mcp
 *
 * Secrets are read from the environment only and are never printed.
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

/** Fill VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY from .env.local when not already set. Reads nothing else. */
function loadPublicEnv() {
  try {
    const file = new URL('../.env.local', import.meta.url);
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const m = /^(VITE_SUPABASE_URL|VITE_SUPABASE_ANON_KEY)=(.*)$/.exec(line.trim());
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {
    // no .env.local, rely on the real environment
  }
}
loadPublicEnv();

const PROGRAM_WEEKS = 8;
const COMPLETED_WEEKS_BEFORE_CURRENT = 3;
const EQUIPMENT = [
  'Dumbbells', 'Barbells', 'Squat Rack', 'Bench', 'Incline Bench',
  'Dip Bar', 'Pull-up Bar', 'Cable Machine', 'Kettlebells',
];
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// Current 1RMs (lbs) for an intermediate lifter. Keys are canonical exercise names.
const MAXES = {
  'Barbell Bench Press': 185,
  'Barbell Back Squat': 245,
  'Deadlift': 295,
  'Overhead Press': 115,
  'Barbell Row': 155,
  'Romanian Deadlift': 225,
};
// Older records so the 1RM screen has history. Weeks ago -> delta from current.
const MAX_HISTORY = [
  { weeksAgo: 12, delta: -15 },
  { weeksAgo: 6, delta: -10 },
  { weeksAgo: 3, delta: -5 },
];

const MAIN_PCT = [70, 72, 75, 77, 80, 82, 85, 62];
const MAIN_REPS = [8, 8, 6, 6, 5, 5, 3, 5];

function fail(message) {
  console.error(`demo-seed: ${message}`);
  process.exit(1);
}

function env(name, fallback) {
  const v = process.env[name] ?? (fallback ? process.env[fallback] : undefined);
  return v && v.trim() ? v.trim() : null;
}

// ── Date helpers (local time, Monday-aligned, same rule as shared/week-math) ──

function mondayOf(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const back = d.getDay() === 0 ? 6 : d.getDay() - 1;
  d.setDate(d.getDate() - back);
  return d;
}

function isoDate(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const round5 = (n) => Math.round(n / 5) * 5;

// ── Program definition ──────────────────────────────────────────────────────

function pctExercise(name, sets, reps, pct, muscleGroups) {
  // The program validator wants reps and muscleGroups as strings.
  return { name, sets, reps: String(reps), percentages: Array(sets).fill(pct), muscleGroups: [].concat(muscleGroups).join(', ') };
}

function fixedExercise(name, sets, reps, weight, muscleGroups) {
  return { name, sets, reps: String(reps), weight_lbs: weight, muscleGroups: [].concat(muscleGroups).join(', ') };
}

function buildWeek(week) {
  const i = week - 1;
  const main = MAIN_PCT[i];
  const reps = MAIN_REPS[i];
  const bump = Math.floor(i / 2) * 5; // accessories go up 5 lbs every two weeks
  const back = main - 8;
  return {
    Monday: {
      focus: 'Upper Body (Push Focus)',
      exercises: [
        pctExercise('Barbell Bench Press', 4, reps, main, ['chest', 'triceps']),
        pctExercise('Barbell Row', 4, 8, back, ['back', 'biceps']),
        pctExercise('Overhead Press', 3, 8, back - 2, ['shoulders']),
        fixedExercise('Lat Pulldown', 3, 10, 110 + bump, ['back']),
        fixedExercise('Lateral Raises', 3, 12, 15 + (i >= 4 ? 5 : 0), ['shoulders']),
      ],
    },
    Tuesday: {
      focus: 'Lower Body (Squat Focus)',
      exercises: [
        pctExercise('Barbell Back Squat', 4, reps, main, ['quads', 'glutes']),
        pctExercise('Romanian Deadlift', 3, 8, back, ['hamstrings', 'glutes']),
        fixedExercise('Bulgarian Split Squat', 3, 8, 35 + bump, ['quads', 'glutes']),
        fixedExercise('Leg Curl', 3, 12, 70 + bump, ['hamstrings']),
        fixedExercise('Standing Calf Raise', 4, 12, 120 + bump, ['calves']),
      ],
    },
    Wednesday: { focus: 'Rest Day', exercises: [] },
    Thursday: {
      focus: 'Upper Body (Pull Focus)',
      exercises: [
        pctExercise('Overhead Press', 4, reps, main, ['shoulders', 'triceps']),
        fixedExercise('Incline Dumbbell Press', 4, 8, 50 + bump, ['chest', 'shoulders']),
        fixedExercise('Cable Row', 4, 10, 120 + bump, ['back']),
        fixedExercise('Face Pulls', 3, 15, 40 + bump, ['rear delts']),
        fixedExercise('Dumbbell Curl', 3, 12, 30, ['biceps']),
      ],
    },
    Friday: {
      focus: 'Lower Body (Deadlift Focus)',
      exercises: [
        pctExercise('Deadlift', 3, Math.min(reps, 5), main, ['hamstrings', 'back']),
        fixedExercise('Front Squat', 3, 6, 135 + bump, ['quads']),
        fixedExercise('Hip Thrust', 3, 10, 185 + bump, ['glutes']),
        fixedExercise('Walking Lunges', 3, 10, 30 + bump, ['quads', 'glutes']),
        fixedExercise('Cable Crunch', 3, 15, 80 + bump, ['abs']),
      ],
    },
    Saturday: { focus: 'Rest Day', exercises: [] },
    Sunday: { focus: 'Rest Day', exercises: [] },
  };
}

function buildProgram() {
  const program = {};
  for (let w = 1; w <= PROGRAM_WEEKS; w++) program[`week${w}`] = buildWeek(w);
  return program;
}

/** Weight the demo lifter actually used for one program exercise. */
function loggedWeight(exercise) {
  if (exercise.percentages) {
    const max = MAXES[exercise.name];
    return round5((Math.max(...exercise.percentages) / 100) * max);
  }
  return exercise.weight_lbs;
}

/** Build log_workout_summary exercise entries for one day. Last set of every third lift drops a rep. */
function buildLogEntries(day, upTo = day.exercises.length) {
  const entries = [];
  day.exercises.slice(0, upTo).forEach((ex, idx) => {
    const weight = loggedWeight(ex);
    const reps = Number(ex.reps);
    if (idx % 3 === 1 && ex.sets > 1) {
      entries.push({ exercise_name: ex.name, sets: ex.sets - 1, reps, weight_lbs: weight });
      entries.push({ exercise_name: ex.name, sets: 1, reps: Math.max(1, reps - 1), weight_lbs: weight });
    } else {
      entries.push({ exercise_name: ex.name, sets: ex.sets, reps, weight_lbs: weight });
    }
  });
  return entries;
}

// ── MCP client (same endpoint and auth an external agent uses) ──────────────

function makeMcp(url, apiKey) {
  let id = 0;
  return async function call(name, args = {}) {
    id += 1;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id,
        method: 'tools/call',
        params: { name, arguments: args },
      }),
    });
    const raw = await res.text();
    if (!res.ok) throw new Error(`MCP ${name} HTTP ${res.status}: ${raw.slice(0, 200)}`);
    const dataLine = raw.split('\n').find((l) => l.startsWith('data:'));
    const payload = JSON.parse(dataLine ? dataLine.slice(5).trim() : raw);
    if (payload.error) throw new Error(`MCP ${name}: ${payload.error.message}`);
    const text = payload.result?.content?.[0]?.text ?? '';
    if (payload.result?.isError) throw new Error(`MCP ${name}: ${text.slice(0, 200)}`);
    if (text.startsWith('{"ok":false')) throw new Error(`MCP ${name}: ${text.slice(0, 200)}`);
    return text;
  };
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  if (!process.argv.includes('--yes')) {
    fail('refusing to run without --yes (this writes to the database in SUPABASE_URL).');
  }
  const email = env('DEMO_EMAIL');
  const password = env('DEMO_PASSWORD');
  const url = env('SUPABASE_URL', 'VITE_SUPABASE_URL');
  const anonKey = env('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY');
  const mcpUrl = env('MCP_URL') ?? 'https://swol-tracker.vercel.app/api/mcp';
  if (!email || !password) fail('set DEMO_EMAIL and DEMO_PASSWORD.');
  if (!email.toLowerCase().endsWith('@example.com')) {
    fail('DEMO_EMAIL must end in @example.com so this can never target a real account.');
  }
  if (!url || !anonKey) fail('set SUPABASE_URL and SUPABASE_ANON_KEY (or the VITE_ equivalents).');

  const supabase = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error: authError } = await supabase.auth.signInWithPassword({ email, password });
  if (authError || !auth?.user) fail(`sign-in failed: ${authError?.message ?? 'no user returned'}`);
  const userId = auth.user.id;
  console.log(`Signed in as demo user ${userId}`);

  const created = { keys: [] };

  try {
    // 1. Gym
    let { data: memberships, error: gymErr } = await supabase
      .from('gym_members').select('gym_id').eq('user_id', userId)
      .order('joined_at', { ascending: true }).order('gym_id', { ascending: true });
    if (gymErr) throw new Error(`gym lookup failed: ${gymErr.message}`);
    if (!memberships?.length) {
      const { data: gymId, error } = await supabase.rpc('create_user_gym', { user_id: userId, gym_name: 'Home Gym' });
      if (error) throw new Error(`create_user_gym failed: ${error.message}`);
      memberships = [{ gym_id: gymId }];
      console.log('Created gym');
    }
    const gymId = memberships[0].gym_id;

    // 2. Temporary MCP key (full scopes), revoked in `finally`
    const { data: keyData, error: keyErr } = await supabase.rpc('create_api_key', {
      p_name: 'Demo Seed',
      p_scopes: ['read', 'write:logs', 'write:program', 'coach'],
    });
    if (keyErr || !keyData?.success) throw new Error(`create_api_key failed: ${keyErr?.message ?? keyData?.error}`);
    created.keys.push(keyData.key_id);
    const mcp = makeMcp(mcpUrl, keyData.key);

    // 3. Profile + onboarding. Start date = Monday N weeks ago, so "today" is the week after the completed ones.
    const currentMonday = mondayOf(new Date());
    const start = new Date(currentMonday);
    start.setDate(start.getDate() - 7 * COMPLETED_WEEKS_BEFORE_CURRENT);
    const startDate = isoDate(start);
    const currentWeek = COMPLETED_WEEKS_BEFORE_CURRENT + 1;

    const { data: profile } = await supabase
      .from('profiles').select('onboarding_completed, program_start_date').eq('id', userId).single();
    if (!profile?.onboarding_completed) {
      await mcp('complete_onboarding', {
        display_name: 'Alex Demo',
        gender: 'male',
        age: 31,
        weight_lbs: 182,
        fitness_goals: ['Build muscle', 'Get stronger'],
        workout_days: ['Monday', 'Tuesday', 'Thursday', 'Friday'],
        workout_duration: '60 minutes',
        workout_location: 'home',
        equipment: EQUIPMENT,
        program_start_date: startDate,
      });
      console.log('Completed onboarding');
    } else if (profile.program_start_date !== startDate) {
      // The one sanctioned re-dating path, for the demo account only. The start date is write-once for
      // users and agents (update_profile rejects it), so this script writes it directly as the demo user.
      // If a DB-level write-once guard is added later, this branch must switch to a service-role client.
      const { data: moved, error: dateErr } = await supabase
        .from('profiles').update({ program_start_date: startDate }).eq('id', userId)
        .select('program_start_date').single();
      if (dateErr || !moved) throw new Error(`moving program start date failed: ${dateErr?.message ?? 'no row updated'}`);
      console.log(`Moved program start date to ${startDate}`);
    }

    // 4. Program
    const { data: programRows } = await supabase
      .from('workout_programs').select('week_number').eq('gym_id', gymId);
    const haveWeeks = new Set((programRows ?? []).map((r) => r.week_number));
    if (haveWeeks.size < PROGRAM_WEEKS) {
      await mcp('generate_workout_program', {
        start_week: 1,
        week_count: PROGRAM_WEEKS,
        program: buildProgram(),
        ai_notes: 'Four-day upper/lower split. Main lifts ramp from 70% to 85% of 1RM over seven weeks, then a deload.',
        gym_id: gymId,
      });
      console.log(`Saved ${PROGRAM_WEEKS}-week program`);
    }

    // 5. Maxes: history straight into user_maxes (RLS, demo user only), newest via the MCP tool
    const { count: maxCount } = await supabase
      .from('user_maxes').select('id', { count: 'exact', head: true }).eq('user_id', userId);
    if (!maxCount) {
      const rows = [];
      for (const [exercise_name, current] of Object.entries(MAXES)) {
        for (const h of MAX_HISTORY) {
          const at = new Date();
          at.setDate(at.getDate() - h.weeksAgo * 7);
          rows.push({ user_id: userId, exercise_name, weight_lbs: current + h.delta, recorded_at: at.toISOString() });
        }
      }
      const { error } = await supabase.from('user_maxes').insert(rows);
      if (error) throw new Error(`max history insert failed: ${error.message}`);
      for (const [exercise_name, weight_lbs] of Object.entries(MAXES)) {
        await mcp('update_max', { exercise_name, weight_lbs });
      }
      console.log('Set maxes');
    }

    // 6. Logs: past weeks complete; current week up to today (last training day so far left mid-workout)
    const { data: logRows } = await supabase
      .from('workout_logs').select('week_number, day_name').eq('user_id', userId).eq('gym_id', gymId);
    const logged = new Set((logRows ?? []).map((r) => `${r.week_number}|${r.day_name}`));
    const todayIdx = (new Date().getDay() + 6) % 7; // Monday = 0
    const trainingDays = ['Monday', 'Tuesday', 'Thursday', 'Friday'];

    for (let week = 1; week <= currentWeek; week++) {
      const weekProgram = buildWeek(week);
      const days = week < currentWeek
        ? trainingDays
        : trainingDays.filter((d) => DAY_NAMES.indexOf(d) <= todayIdx);
      const lastDay = days[days.length - 1];
      for (const dayName of days) {
        if (logged.has(`${week}|${dayName}`)) continue;
        const day = weekProgram[dayName];
        const inProgress = week === currentWeek && dayName === lastDay;
        const upTo = inProgress ? Math.max(1, day.exercises.length - 2) : day.exercises.length;
        await mcp('log_workout_summary', {
          gym_id: gymId,
          week_number: week,
          day_name: dayName,
          exercises: buildLogEntries(day, upTo),
          mark_complete: !inProgress,
        });
        console.log(`Logged week ${week} ${dayName}${inProgress ? ' (in progress)' : ''}`);
      }
    }

    // 7. Coach Board
    const { count: msgCount } = await supabase
      .from('agent_messages').select('id', { count: 'exact', head: true }).eq('user_id', userId);
    if (!msgCount) {
      await mcp('send_coach_message', {
        message_type: 'program_update',
        week_number: 1,
        content:
          "**Your 8-week block is in.** Four days a week, upper/lower. Main lifts start at 70% of your 1RM and climb to 85% by week 7, then a lighter week 8 to reset.\nBench 185, squat 245, deadlift 295 are the numbers I'm building from. Tell me if any of those feel off.",
      });
      await mcp('send_coach_message', {
        message_type: 'weekly_review',
        week_number: COMPLETED_WEEKS_BEFORE_CURRENT,
        content:
          "**Week 3 review.** 4 of 4 sessions done, every prescribed set logged.\n**Bench:** 4x6 at 140 moved clean, all reps. **Squat:** 4x6 at 185, last set of week 3 was the slowest, so hold the load before adding.\nNext week the main lifts go up about 2 to 3 percent. Keep sleep steady and eat enough on Tuesday and Friday.",
      });
      await supabase.rpc('send_agent_message', {
        p_user_id: userId,
        p_content: 'Shoulder felt a bit tight on overhead press Thursday. Should I back off?',
        p_role: 'user',
        p_message_type: 'chat',
      });
      await mcp('send_coach_message', {
        message_type: 'chat',
        content:
          "Good catch. Keep overhead press at the prescribed weight but stop every set one rep short, and add 2 sets of face pulls after. If it still pinches next week, swap in dumbbell press and tell me.",
      });
      console.log('Sent Coach Board notes');
    }
  } finally {
    // 8. Revoke keys this run minted. Coach Board only shows while the user has an active key,
    // so leave one inert read-only key behind whose secret was never kept.
    for (const keyId of created.keys) {
      const { error } = await supabase.rpc('revoke_api_key', { p_key_id: keyId });
      if (error) console.error(`WARNING: could not revoke temporary key ${keyId}: ${error.message}`);
      else console.log('Revoked temporary seed key');
    }
    const { count: active } = await supabase
      .from('api_keys').select('id', { count: 'exact', head: true }).eq('user_id', userId).is('revoked_at', null);
    if (!active) {
      const { data, error } = await supabase.rpc('create_api_key', { p_name: 'Demo Agent (inert)', p_scopes: ['read'] });
      if (error || !data?.success) console.error('WARNING: could not create placeholder key');
      else console.log('Created inert read-only placeholder key (secret discarded)');
    }
  }

  console.log('Done.');
}

main().catch((err) => fail(err.message));
