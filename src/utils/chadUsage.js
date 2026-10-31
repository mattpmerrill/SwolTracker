// Pure helpers for the admin Chad tab: number formatting, the daily cost bars, the approval
// breakdown, the pricing panel, and the two app_settings values that go with it. No React imports,
// so they run under Vitest in Node. The report itself is get_chad_usage (migrations/044).
import { chadPriceSchema } from '../lib/validation';

export const USAGE_WINDOWS = [7, 30, 90];
export const ROLLOUT_OPTIONS = ['admin', 'all'];

/** Dollars. Chad's costs are cents or fractions of one, so small values keep four decimals. */
export function formatUsd(value) {
  if (value == null) return 'n/a';
  const n = Number(value);
  if (!Number.isFinite(n)) return 'n/a';
  if (n === 0) return '$0.00';
  if (Math.abs(n) < 1) return `$${n.toFixed(4)}`;
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** 950 -> "950", 12_400 -> "12.4k", 3_100_000 -> "3.1M". */
export function formatTokens(value) {
  if (value == null) return 'n/a';
  const n = Number(value);
  if (!Number.isFinite(n)) return 'n/a';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n));
}

/** 0.5 -> "50%". null (nothing to rate yet) -> a dash. */
export function formatPercent(rate) {
  if (rate == null) return 'n/a';
  const n = Number(rate);
  return Number.isFinite(n) ? `${Math.round(n * 100)}%` : 'n/a';
}

/** Hours to a decision: "42 min", "5.5 h". null -> a dash. */
export function formatHours(hours) {
  if (hours == null) return 'n/a';
  const n = Number(hours);
  if (!Number.isFinite(n)) return 'n/a';
  if (n < 1) return `${Math.max(1, Math.round(n * 60))} min`;
  return `${n.toFixed(1)} h`;
}

/**
 * Bar heights for the daily cost chart: each day as a share of the busiest day. A day with any
 * spend gets at least a sliver so it does not read as zero.
 */
export function dailyBars(daily) {
  const rows = Array.isArray(daily) ? daily : [];
  const max = rows.reduce((m, d) => Math.max(m, Number(d.cost_usd) || 0), 0);
  return rows.map((d) => {
    const cost = Number(d.cost_usd) || 0;
    const pct = max > 0 ? Math.max(cost > 0 ? 3 : 0, (cost / max) * 100) : 0;
    return { day: d.day, cost_usd: cost, runs: Number(d.runs) || 0, pct: Math.round(pct * 10) / 10 };
  });
}

/** The approval counts as labelled rows, in the order an admin reads them. */
export function approvalRows(approval) {
  const a = approval || {};
  return [
    { key: 'applied', label: 'Applied', count: Number(a.applied) || 0, hint: 'Every change saved' },
    { key: 'partial', label: 'Partly applied', count: Number(a.partial) || 0, hint: 'Some saved, some skipped' },
    { key: 'declined', label: 'Declined', count: Number(a.declined) || 0, hint: 'Skipped, or "Got it" on a quiet week' },
    { key: 'expired', label: 'Expired', count: Number(a.expired) || 0, hint: 'No answer before Monday night' },
    { key: 'open', label: 'Waiting', count: Number(a.open) || 0, hint: 'Drafting or waiting on the user' },
    { key: 'failed', label: 'Failed', count: Number(a.failed) || 0, hint: 'Every ticked change conflicted / draft gave up' },
  ];
}

/**
 * Margin math for the pricing panel. `usage` is the get_chad_usage report. The window's cost per
 * active user is scaled to 30 days so it compares with a monthly plan price. Returns null until
 * there is a price to work with, and { noUsage: true } when the window has no active users.
 */
export function pricingMath({ planPrice, usage }) {
  const price = Number(planPrice);
  if (!Number.isFinite(price) || price <= 0) return null;
  const perUser = usage?.totals?.cost_per_active_user;
  const days = Number(usage?.days);
  if (perUser == null || !Number.isFinite(Number(perUser)) || !(days > 0)) return { noUsage: true };

  const monthlyCostPerUser = (Number(perUser) * 30) / days;
  const margin = price - monthlyCostPerUser;
  const runs = Number(usage?.totals?.runs) || 0;
  const totalCost = Number(usage?.totals?.cost_usd) || 0;
  const costPerRun = runs > 0 ? totalCost / runs : null;
  return {
    noUsage: false,
    monthlyCostPerUser,
    margin,
    marginPct: margin / price,
    // The most Chad can cost per user per month before the plan stops paying for itself.
    breakEvenCost: price,
    // How many times today's usage that is.
    breakEvenMultiple: monthlyCostPerUser > 0 ? price / monthlyCostPerUser : null,
    costPerRun,
    breakEvenRunsPerUser: costPerRun > 0 ? price / costPerRun : null,
  };
}

/** Read app_settings chad_price_per_mtok (a JSON string) into { input, output }, or null. */
export function parseChadPrice(raw) {
  if (raw == null || raw === '') return null;
  try {
    const parsed = chadPriceSchema.safeParse(typeof raw === 'string' ? JSON.parse(raw) : raw);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Turn the two price fields into the JSON the setting stores. Both are dollars per million tokens;
 * they are saved together so the server never prices a call with half a rate.
 * @returns {{ ok: true, value: string, price: { input: number, output: number } } | { ok: false, error: string }}
 */
export function buildChadPriceSetting(inputText, outputText) {
  const toNumber = (text) => (String(text ?? '').trim() === '' ? NaN : Number(text));
  const parsed = chadPriceSchema.safeParse({ input: toNumber(inputText), output: toNumber(outputText) });
  if (!parsed.success) {
    return { ok: false, error: 'Enter both prices as dollars per million tokens, between 0 and 1000.' };
  }
  return { ok: true, price: parsed.data, value: JSON.stringify(parsed.data) };
}

/** app_settings chad_checkin_rollout: 'all' or the default, 'admin'. Anything else is 'admin'. */
export function normalizeRollout(raw) {
  return typeof raw === 'string' && raw.trim().toLowerCase() === 'all' ? 'all' : 'admin';
}
