import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, RefreshCw, Activity, Coins, Users, Gauge, Hash } from 'lucide-react';
import {
  USAGE_WINDOWS,
  formatUsd,
  formatTokens,
  formatPercent,
  formatHours,
  dailyBars,
  approvalRows,
  pricingMath,
} from '../../utils/chadUsage';

const CARD = 'bg-zinc-900/50 backdrop-blur-xl rounded-2xl p-6 border border-white/5 shadow-xl shadow-black/20';

const INSTIGATION_LABELS = {
  schedule: 'Weekly check-in',
  day_missed: 'Missed day',
  user_action: 'User action',
  user_message: 'Chat message',
};

function Stat({ icon: Icon, label, value, sub }) {
  return (
    <div className={`${CARD} min-w-0`}>
      <div className="flex items-center gap-3 mb-3">
        <div className="p-2.5 rounded-xl bg-orange-500/15 text-orange-400 ring-1 ring-inset ring-black/20">
          <Icon className="w-5 h-5" aria-hidden="true" />
        </div>
        <span className="text-sm font-medium text-zinc-400 min-w-0">{label}</span>
      </div>
      <p className="text-2xl sm:text-3xl font-bold text-white tracking-tight break-words">{value}</p>
      {sub && <p className="text-xs text-zinc-500 mt-1">{sub}</p>}
    </div>
  );
}

function Section({ title, children, note }) {
  return (
    <section className={CARD}>
      <h3 className="font-semibold text-white mb-1">{title}</h3>
      {note && <p className="text-xs text-zinc-500 mb-4">{note}</p>}
      {!note && <div className="mb-3" />}
      {children}
    </section>
  );
}

function PricingPanel({ usage }) {
  const [planPrice, setPlanPrice] = useState('');
  const math = useMemo(() => pricingMath({ planPrice, usage }), [planPrice, usage]);

  return (
    <Section
      title="Pricing check"
      note="Enter what a user pays per month. Chad's cost is scaled from the window above to 30 days."
    >
      <label htmlFor="chad-plan-price" className="block text-sm text-zinc-400 mb-2">Plan price, $ per month</label>
      <input
        id="chad-plan-price"
        type="number"
        inputMode="decimal"
        min="0"
        step="0.01"
        value={planPrice}
        onChange={(e) => setPlanPrice(e.target.value)}
        placeholder="e.g. 9.99"
        className="w-full sm:w-48 px-4 py-3 bg-zinc-950/50 rounded-xl border border-white/5 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition-all text-sm text-white placeholder:text-zinc-600"
      />
      {math?.noUsage && (
        <p className="text-sm text-zinc-400 mt-4">No active users in this window yet, so there is nothing to price.</p>
      )}
      {math && !math.noUsage && (
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5">
          <div>
            <dt className="text-xs text-zinc-500">Chad cost per active user, per month</dt>
            <dd className="text-lg font-semibold text-white">{formatUsd(math.monthlyCostPerUser)}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Margin per active user</dt>
            <dd className={`text-lg font-semibold ${math.margin >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {formatUsd(math.margin)} ({formatPercent(math.marginPct)})
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Break-even Chad cost per user, per month</dt>
            <dd className="text-lg font-semibold text-white">{formatUsd(math.breakEvenCost)}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Headroom before break-even</dt>
            <dd className="text-lg font-semibold text-white">
              {math.breakEvenMultiple == null ? 'No cost yet' : `${math.breakEvenMultiple.toFixed(1)}x today's usage`}
              {math.breakEvenRunsPerUser != null && (
                <span className="block text-xs font-normal text-zinc-500">
                  About {Math.floor(math.breakEvenRunsPerUser)} runs per user per month at {formatUsd(math.costPerRun)} a run
                </span>
              )}
            </dd>
          </div>
        </dl>
      )}
    </Section>
  );
}

/**
 * Admin "Chad" tab: what the weekly check-in costs, who uses it, how often people say yes, and how
 * reliable it is. Reads get_chad_usage through db.getChadUsage (admin only).
 */
const AdminChadUsage = ({ db }) => {
  const [days, setDays] = useState(30);
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // A slow older response (a different window, or a refresh) must not overwrite a newer one.
  const loadSeqRef = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    setLoading(true);
    setError(null);
    try {
      const data = await db.getChadUsage(days);
      if (seq !== loadSeqRef.current) return;
      if (data) setUsage(data);
      else setError('Failed to load Chad usage. Make sure you have admin access and migration 044 is applied.');
    } catch (err) {
      console.error('Error loading Chad usage:', err);
      if (seq === loadSeqRef.current) setError(err?.message || 'Failed to load Chad usage');
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, [db, days]);

  useEffect(() => {
    load();
  }, [load]);

  const bars = useMemo(() => dailyBars(usage?.daily_cost), [usage]);
  const approval = usage?.approval;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Time window" className="inline-flex rounded-xl border border-white/10 overflow-hidden">
          {USAGE_WINDOWS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setDays(option)}
              aria-pressed={days === option}
              className={`px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 ${
                days === option ? 'bg-orange-500/20 text-orange-300' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
              }`}
            >
              {option} days
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-xl bg-zinc-800 border border-white/10 text-zinc-200 hover:bg-zinc-700 disabled:opacity-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" />
          Refresh
        </button>
      </div>

      {loading && !usage && (
        <div className="flex justify-center py-16" role="status">
          <Loader2 className="w-8 h-8 animate-spin motion-reduce:animate-none text-orange-500" />
          <span className="sr-only">Loading Chad usage</span>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>
      )}

      {usage && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
            <Stat icon={Activity} label="Runs" value={usage.totals.runs} sub={`Last ${usage.days} days`} />
            <Stat icon={Hash} label="Tokens" value={formatTokens(usage.totals.tokens)} />
            <Stat icon={Coins} label="Cost" value={formatUsd(usage.totals.cost_usd)} />
            <Stat icon={Users} label="Active users" value={usage.totals.active_users} />
            <Stat icon={Gauge} label="Cost per active user" value={formatUsd(usage.totals.cost_per_active_user)} />
          </div>

          <Section title="Daily cost" note="UTC days, tallest bar is the busiest day.">
            <div
              role="img"
              aria-label={`Daily Chad cost over ${usage.days} days. Total ${formatUsd(usage.totals.cost_usd)}.`}
              className="flex items-end gap-1 h-32"
            >
              {bars.map((bar) => (
                <div key={bar.day} className="flex-1 min-w-[3px] h-full flex items-end" title={`${bar.day}: ${formatUsd(bar.cost_usd)}, ${bar.runs} runs`}>
                  <div className="w-full rounded-t bg-gradient-to-t from-orange-600 to-orange-400" style={{ height: `${bar.pct}%` }} />
                </div>
              ))}
            </div>
            <div className="flex justify-between text-xs text-zinc-500 mt-2">
              <span>{bars[0]?.day}</span>
              <span>{bars[bars.length - 1]?.day}</span>
            </div>
          </Section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Section title="By instigation" note="What set the work going.">
              {usage.by_instigation.length === 0 ? (
                <p className="text-sm text-zinc-500">Nothing yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-zinc-500">
                      <th className="pb-2 font-medium">Source</th>
                      <th className="pb-2 font-medium text-right pl-3">Runs</th>
                      <th className="pb-2 font-medium text-right pl-3">Tokens</th>
                      <th className="pb-2 font-medium text-right pl-3">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usage.by_instigation.map((row) => (
                      <tr key={row.instigation} className="border-t border-white/5 text-zinc-300">
                        <td className="py-2">{INSTIGATION_LABELS[row.instigation] || row.instigation}</td>
                        <td className="py-2 text-right pl-3">{row.runs}</td>
                        <td className="py-2 text-right pl-3">{formatTokens(row.tokens)}</td>
                        <td className="py-2 text-right pl-3">{formatUsd(row.cost_usd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>

            <Section title="Approval" note="The rate counts check-ins that proposed at least one change. Quiet weeks are left out.">
              <p className="text-3xl font-bold text-white">{formatPercent(approval.approval_rate)}</p>
              <p className="text-xs text-zinc-500 mb-4">
                Median time to a decision: {formatHours(usage.median_hours_to_decision)}
              </p>
              <ul className="space-y-2">
                {approvalRows(approval).map((row) => (
                  <li key={row.key} className="flex items-start justify-between gap-3 text-sm">
                    <span className="text-zinc-300">
                      {row.label}
                      <span className="block text-xs text-zinc-500">{row.hint}</span>
                    </span>
                    <span className="font-semibold text-white">{row.count}</span>
                  </li>
                ))}
              </ul>
            </Section>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Section title="Reliability" note="Steps that failed, and extra attempts after a first failure.">
              <dl className="grid grid-cols-2 gap-4">
                <div>
                  <dt className="text-xs text-zinc-500">Failed steps</dt>
                  <dd className="text-2xl font-bold text-white">{usage.reliability.failures}</dd>
                </div>
                <div>
                  <dt className="text-xs text-zinc-500">Retries</dt>
                  <dd className="text-2xl font-bold text-white">{usage.reliability.retries}</dd>
                </div>
              </dl>
            </Section>

            <Section title="Top users" note="By cost, top 10.">
              {usage.top_users.length === 0 ? (
                <p className="text-sm text-zinc-500">Nothing yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-zinc-500">
                      <th className="pb-2 font-medium">User</th>
                      <th className="pb-2 font-medium text-right pl-3">Runs</th>
                      <th className="pb-2 font-medium text-right pl-3">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usage.top_users.map((row) => (
                      <tr key={row.user_id} className="border-t border-white/5 text-zinc-300">
                        <td className="py-2 max-w-[10rem] truncate" title={row.email || row.user_id}>{row.email || row.user_id}</td>
                        <td className="py-2 text-right pl-3">{row.runs}</td>
                        <td className="py-2 text-right pl-3">{formatUsd(row.cost_usd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>
          </div>

          <PricingPanel usage={usage} />
        </>
      )}
    </div>
  );
};

export default AdminChadUsage;
