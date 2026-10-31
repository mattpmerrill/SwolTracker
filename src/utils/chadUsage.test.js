import { describe, it, expect } from 'vitest';
import {
  formatUsd,
  formatTokens,
  formatPercent,
  formatHours,
  dailyBars,
  approvalRows,
  pricingMath,
  parseChadPrice,
  buildChadPriceSetting,
  normalizeRollout,
} from './chadUsage';

describe('formatting', () => {
  it('formats dollars with more precision for fractions of a dollar', () => {
    expect(formatUsd(0)).toBe('$0.00');
    expect(formatUsd(0.0123)).toBe('$0.0123');
    expect(formatUsd(12.5)).toBe('$12.50');
    expect(formatUsd(1234.5)).toBe('$1,234.50');
    expect(formatUsd(null)).toBe('n/a');
    expect(formatUsd(undefined)).toBe('n/a');
    expect(formatUsd('x')).toBe('n/a');
  });

  it('formats tokens', () => {
    expect(formatTokens(950)).toBe('950');
    expect(formatTokens(12400)).toBe('12.4k');
    expect(formatTokens(3100000)).toBe('3.1M');
    expect(formatTokens(undefined)).toBe('n/a');
  });

  it('formats a rate and a duration, with a dash when there is nothing', () => {
    expect(formatPercent(0.5)).toBe('50%');
    expect(formatPercent(0.666)).toBe('67%');
    expect(formatPercent(null)).toBe('n/a');
    expect(formatHours(0.25)).toBe('15 min');
    expect(formatHours(5.5)).toBe('5.5 h');
    expect(formatHours(null)).toBe('n/a');
  });
});

describe('dailyBars', () => {
  it('scales each day against the busiest day and keeps a sliver for tiny spend', () => {
    const bars = dailyBars([
      { day: '2026-10-29', cost_usd: 0, runs: 0 },
      { day: '2026-10-30', cost_usd: 0.5, runs: 2 },
      { day: '2026-10-31', cost_usd: 1, runs: 4 },
      { day: '2026-11-01', cost_usd: 0.0001, runs: 1 },
    ]);
    expect(bars.map((b) => b.pct)).toEqual([0, 50, 100, 3]);
    expect(bars[2]).toMatchObject({ day: '2026-10-31', runs: 4 });
  });

  it('is all zero for a quiet window, and survives bad input', () => {
    expect(dailyBars([{ day: 'a', cost_usd: 0, runs: 0 }])[0].pct).toBe(0);
    expect(dailyBars(null)).toEqual([]);
  });
});

describe('approvalRows', () => {
  it('labels every status and explains the failed bucket', () => {
    const rows = approvalRows({ applied: 3, partial: 1, declined: 2, expired: 0, open: 1, failed: 1, approval_rate: 0.67 });
    expect(rows.map((r) => [r.key, r.count])).toEqual([
      ['applied', 3], ['partial', 1], ['declined', 2], ['expired', 0], ['open', 1], ['failed', 1],
    ]);
    expect(rows.find((r) => r.key === 'failed').hint).toBe('Every ticked change conflicted / draft gave up');
  });

  it('is all zeros for a missing report', () => {
    expect(approvalRows(null).every((r) => r.count === 0)).toBe(true);
  });
});

describe('pricingMath', () => {
  const usage = { days: 30, totals: { runs: 40, cost_usd: 2, active_users: 4, cost_per_active_user: 0.5 } };

  it('needs a positive price', () => {
    expect(pricingMath({ planPrice: '', usage })).toBeNull();
    expect(pricingMath({ planPrice: '0', usage })).toBeNull();
    expect(pricingMath({ planPrice: 'abc', usage })).toBeNull();
  });

  it('works out margin and break-even from a 30 day window', () => {
    const result = pricingMath({ planPrice: '10', usage });
    expect(result.monthlyCostPerUser).toBeCloseTo(0.5);
    expect(result.margin).toBeCloseTo(9.5);
    expect(result.marginPct).toBeCloseTo(0.95);
    expect(result.breakEvenCost).toBe(10);
    expect(result.breakEvenMultiple).toBeCloseTo(20);
    expect(result.costPerRun).toBeCloseTo(0.05);
    expect(result.breakEvenRunsPerUser).toBeCloseTo(200);
  });

  it('scales a short window up to a month', () => {
    const week = { days: 7, totals: { runs: 7, cost_usd: 0.7, active_users: 1, cost_per_active_user: 0.7 } };
    expect(pricingMath({ planPrice: 20, usage: week }).monthlyCostPerUser).toBeCloseTo((0.7 * 30) / 7);
  });

  it('says there is no usage when nobody was active', () => {
    const empty = { days: 30, totals: { runs: 0, cost_usd: 0, active_users: 0, cost_per_active_user: null } };
    expect(pricingMath({ planPrice: 10, usage: empty })).toEqual({ noUsage: true });
  });

  it('has no break-even multiple at zero cost', () => {
    const free = { days: 30, totals: { runs: 3, cost_usd: 0, active_users: 1, cost_per_active_user: 0 } };
    const result = pricingMath({ planPrice: 10, usage: free });
    expect(result.margin).toBe(10);
    expect(result.breakEvenMultiple).toBeNull();
    expect(result.breakEvenRunsPerUser).toBeNull();
  });
});

describe('price setting', () => {
  it('reads the stored JSON, or an object, and rejects junk', () => {
    expect(parseChadPrice('{"input":3,"output":15}')).toEqual({ input: 3, output: 15 });
    expect(parseChadPrice({ input: 0.5, output: 2 })).toEqual({ input: 0.5, output: 2 });
    expect(parseChadPrice('{"input":-1,"output":2}')).toBeNull();
    expect(parseChadPrice('not json')).toBeNull();
    expect(parseChadPrice('')).toBeNull();
    expect(parseChadPrice(null)).toBeNull();
  });

  it('builds the JSON both prices are saved as', () => {
    expect(buildChadPriceSetting('3', '15.5')).toEqual({
      ok: true,
      price: { input: 3, output: 15.5 },
      value: '{"input":3,"output":15.5}',
    });
  });

  it('refuses an empty, negative or non-numeric price', () => {
    expect(buildChadPriceSetting('', '15').ok).toBe(false);
    expect(buildChadPriceSetting('3', '').ok).toBe(false);
    expect(buildChadPriceSetting('-1', '15').ok).toBe(false);
    expect(buildChadPriceSetting('abc', '15').ok).toBe(false);
    expect(buildChadPriceSetting('3', '5000').ok).toBe(false);
  });
});

describe('normalizeRollout', () => {
  it('is admin unless the setting says all', () => {
    expect(normalizeRollout('all')).toBe('all');
    expect(normalizeRollout(' ALL ')).toBe('all');
    expect(normalizeRollout('admin')).toBe('admin');
    expect(normalizeRollout('everyone')).toBe('admin');
    expect(normalizeRollout(null)).toBe('admin');
  });
});
