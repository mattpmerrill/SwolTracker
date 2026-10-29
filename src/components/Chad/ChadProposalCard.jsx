import { Check, X, Loader2 } from 'lucide-react';
import { diffDayExercises } from '../../utils/chadProposal';

const STATUS_STYLES = {
  added: 'text-emerald-400',
  removed: 'text-red-400 line-through decoration-red-400/50',
  same: 'text-zinc-200',
};

function ExerciseList({ title, rows, emptyText }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">{title}</p>
      {rows.length === 0 ? (
        <p className="text-xs text-zinc-600 italic">{emptyText}</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((row, i) => (
            <li key={`${row.name}-${i}`} className="text-xs leading-snug">
              <span className={`font-medium break-words ${STATUS_STYLES[row.status]}`}>{row.name}</span>
              {row.detail && <span className="block text-zinc-500">{row.detail}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Chad's proposed edit to one program day. Nothing is saved until Apply.
 */
export default function ChadProposalCard({ proposal, loading, activeAction = null, onApply, onReject }) {
  const { week, day, summary, before, after } = proposal;
  const diff = diffDayExercises(before, after);

  return (
    <div className="rounded-2xl border border-orange-500/30 bg-orange-500/5 p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-orange-400">
        Week {week} · {day}
      </p>
      {summary && <p className="text-sm text-zinc-200 mt-2 leading-relaxed">{summary}</p>}

      <div className="grid grid-cols-2 gap-3 mt-3 rounded-xl bg-zinc-950/60 border border-zinc-800 p-3">
        <ExerciseList title="Before" rows={diff.before} emptyText="Rest day" />
        <ExerciseList title="After" rows={diff.after} emptyText="Empty" />
      </div>

      <div className="flex gap-2 mt-3">
        <button
          type="button"
          onClick={onApply}
          disabled={loading}
          className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 text-white text-sm font-semibold hover:from-orange-400 hover:to-red-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
        >
          {loading && activeAction === 'apply' ? <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" /> : <Check className="w-4 h-4" />}
          Apply
        </button>
        <button
          type="button"
          onClick={onReject}
          disabled={loading}
          className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm font-medium hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500"
        >
          {loading && activeAction === 'reject' ? <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" /> : <X className="w-4 h-4" />}
          Nah
        </button>
      </div>
    </div>
  );
}
