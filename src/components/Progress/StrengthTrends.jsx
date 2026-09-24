import { TrendingUp } from 'lucide-react';

/**
 * Per-lift estimated-1RM trend (best set per week) from the loaded log window.
 * Renders nothing until at least one lift has two weeks of loaded sets.
 */
function Sparkline({ points }) {
  const W = 120;
  const H = 32;
  const vals = points.map(p => p.e1rm);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const step = points.length > 1 ? W / (points.length - 1) : 0;
  const coords = points.map((p, i) => [i * step, H - 3 - ((p.e1rm - min) / span) * (H - 6)]);
  const d = coords.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const [lx, ly] = coords[coords.length - 1];
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="overflow-visible" aria-hidden="true">
      <path d={d} fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r="3" fill="#f97316" />
    </svg>
  );
}

export default function StrengthTrends({ trends }) {
  if (!trends?.length) return null;

  return (
    <div className="bg-zinc-900/50 rounded-2xl border border-zinc-800/50 p-5 mt-6">
      <h3 className="font-bold mb-1 flex items-center gap-2">
        <TrendingUp className="w-5 h-5 text-orange-400" />
        Strength Trend
      </h3>
      <p className="text-xs text-zinc-500 mb-4">Estimated max from your best set each week</p>
      <div className="space-y-4">
        {trends.map(t => (
          <div key={t.lift} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-zinc-300 truncate">{t.lift}</p>
              <p className="text-xs text-zinc-500">
                ~{t.latest} lbs
                {t.change !== 0 && (
                  <span className={t.change > 0 ? 'text-green-400 ml-2' : 'text-zinc-500 ml-2'}>
                    {t.change > 0 ? '+' : ''}{t.change} lbs this block
                  </span>
                )}
              </p>
            </div>
            <Sparkline points={t.points} />
          </div>
        ))}
      </div>
    </div>
  );
}
