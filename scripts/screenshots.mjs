#!/usr/bin/env node
/**
 * Capture the README screenshots into docs/screenshots/ using Playwright.
 *
 * Signed-out shots (login) use a clean browser context. Signed-in shots sign in
 * as the demo user through the Supabase password grant (the app itself only
 * offers Google sign-in), then hand the session to the page via localStorage,
 * which is exactly where supabase-js keeps it.
 *
 * Usage:
 *   DEMO_EMAIL=demo@example.com DEMO_PASSWORD=... npm run screenshots
 *   npm run screenshots -- --only=workout,maxes     (subset, by name prefix)
 *
 * Env:
 *   BASE_URL       defaults to https://swol-tracker.vercel.app
 *   DEMO_EMAIL, DEMO_PASSWORD
 *   SUPABASE_URL / SUPABASE_ANON_KEY (default to VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY,
 *                  read from .env.local when unset)
 *
 * Needs: npx playwright install chromium
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';

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

const BASE_URL = (process.env.BASE_URL || 'https://swol-tracker.vercel.app').replace(/\/$/, '');
const OUT_DIR = fileURLToPath(new URL('../docs/screenshots/', import.meta.url));
const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };
const TRAINING_DAYS = ['Monday', 'Tuesday', 'Thursday', 'Friday'];
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const args = process.argv.slice(2);
const only = (args.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const wanted = (name) => only.length === 0 || only.some((o) => name.startsWith(o));

function fail(message) {
  console.error(`screenshots: ${message}`);
  process.exit(1);
}

/** Day the workout shots show: today if it is a training day, else the most recent one (matches demo-seed). */
function workoutDay() {
  const todayIdx = (new Date().getDay() + 6) % 7;
  for (let i = todayIdx; i >= 0; i--) {
    if (TRAINING_DAYS.includes(DAY_NAMES[i])) return DAY_NAMES[i];
  }
  return 'Monday';
}

async function getSession() {
  const email = process.env.DEMO_EMAIL;
  const password = process.env.DEMO_PASSWORD;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!email || !password) fail('set DEMO_EMAIL and DEMO_PASSWORD for the signed-in shots.');
  if (!email.toLowerCase().endsWith('@example.com')) fail('DEMO_EMAIL must end in @example.com.');
  if (!url || !anonKey) fail('set SUPABASE_URL and SUPABASE_ANON_KEY (or the VITE_ equivalents).');
  const supabase = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data?.session) fail(`demo sign-in failed: ${error?.message ?? 'no session'}`);
  const ref = new URL(url).hostname.split('.')[0];
  return { storageKey: `sb-${ref}-auth-token`, session: data.session };
}

const FREEZE_CSS = `
  *, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }
  ::-webkit-scrollbar { display: none; }
`;

async function settle(page) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: FREEZE_CSS });
  // No spinners in a shot
  await page.waitForFunction(() => !document.querySelector('.animate-spin'), null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(600);
}

async function shoot(page, name) {
  await settle(page);
  await page.screenshot({ path: `${OUT_DIR}${name}.png` });
  console.log(`wrote docs/screenshots/${name}.png`);
}

async function newContext(browser, viewport, auth) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    isMobile: viewport.width < 600,
    hasTouch: viewport.width < 600,
    colorScheme: 'dark',
    locale: 'en-US',
    timezoneId: 'America/Denver',
  });
  if (auth) {
    await context.addInitScript(
      ({ key, value }) => {
        localStorage.setItem(key, value);
        // Suppress one-time prompts
        localStorage.setItem('swoltracker-push-prompt-shown', '1');
        localStorage.setItem('swoltracker-pwa-hint-dismissed', 'true');
      },
      { key: auth.storageKey, value: JSON.stringify(auth.session) }
    );
  }
  return context;
}

async function openApp(page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /^Workout$/ }).waitFor({ timeout: 30000 });
  await settle(page);
}

async function selectWorkoutDay(page) {
  const abbr = workoutDay().slice(0, 3);
  const dayButton = page.getByRole('button', { name: new RegExp(`^${abbr}\\s*\\d+$`) });
  // The week strip is collapsed behind "This week" on the today-first layout.
  if (!(await dayButton.isVisible())) {
    await page.getByRole('button', { name: /This week/ }).click();
  }
  await dayButton.click();
  // First exercise card proves the day's program rendered
  await page.getByText(/Barbell|Deadlift|Overhead Press/).first().waitFor({ timeout: 15000 });
}

async function tab(page, label) {
  await page.getByRole('button', { name: new RegExp(`^${label}$`) }).click();
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  try {
    // Signed out
    if (wanted('login')) {
      for (const [suffix, viewport] of [['mobile', MOBILE], ['desktop', DESKTOP]]) {
        const context = await newContext(browser, viewport, null);
        const page = await context.newPage();
        await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
        await page.getByText('Welcome Back').waitFor({ timeout: 30000 });
        await shoot(page, `login-${suffix}`);
        await context.close();
      }
    }

    const needsAuth = ['workout', 'maxes', 'progress', 'coach-board'].some(wanted);
    if (!needsAuth) return;
    const auth = await getSession();

    for (const [suffix, viewport] of [['mobile', MOBILE], ['desktop', DESKTOP]]) {
      const context = await newContext(browser, viewport, auth);
      const page = await context.newPage();
      await openApp(page);

      if (wanted('workout')) {
        await selectWorkoutDay(page);
        // Picking a day scrolls to the week strip; the logged sets are at the top.
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(400);
        await shoot(page, `workout-${suffix}`);
      }
      if (wanted('maxes')) {
        await tab(page, '1RM');
        await page.getByText(/Barbell Bench Press|Bench/).first().waitFor({ timeout: 15000 });
        await shoot(page, `maxes-${suffix}`);
      }
      if (wanted('progress')) {
        await tab(page, 'Progress');
        await page.getByText('Track your gains over time').waitFor({ timeout: 15000 });
        await shoot(page, `progress-${suffix}`);
      }

      if (suffix === 'mobile') {
        if (wanted('coach-board')) {
          await tab(page, 'Workout');
          await page.getByRole('button', { name: /Open Coach Board/ }).click();
          await page.getByText(/Week 3 review/).first().waitFor({ timeout: 15000 });
          await shoot(page, 'coach-board-mobile');
          await page.keyboard.press('Escape');
          await page.reload({ waitUntil: 'domcontentloaded' });
          await page.getByRole('button', { name: /^Workout$/ }).waitFor({ timeout: 30000 });
        }
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => fail(err.message));
