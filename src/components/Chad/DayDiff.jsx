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
 * Before and After columns for one program day. Shared by the chat proposal and the check-in card,
 * so a change reads the same wherever Chad proposes it.
 */
export default function DayDiff({ before, after }) {
  const diff = diffDayExercises(before, after);
  return (
    <div className="grid grid-cols-2 gap-3 rounded-xl bg-zinc-950/60 border border-zinc-800 p-3">
      <ExerciseList title="Before" rows={diff.before} emptyText="Rest day" />
      <ExerciseList title="After" rows={diff.after} emptyText="Empty" />
    </div>
  );
}
