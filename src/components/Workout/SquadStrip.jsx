/**
 * One-line gym status on Today. Data is already in completions / missed maps.
 */
const STATUS = {
  done: { label: 'done', className: 'bg-green-500/15 text-green-300 border-green-500/25' },
  skipped: { label: 'skipped', className: 'bg-amber-500/15 text-amber-300 border-amber-500/25' },
  due: { label: 'due', className: 'bg-zinc-800/80 text-zinc-300 border-zinc-700/50' },
};

export default function SquadStrip({ people, dayLabel }) {
  if (!people?.length) return null;

  return (
    <div className="mb-4 -mx-1 px-1 overflow-x-auto scrollbar-hide">
      <p className="text-[11px] uppercase tracking-wider text-zinc-500 mb-2">
        Squad{dayLabel ? ` · ${dayLabel}` : ''}
      </p>
      <div className="flex gap-2">
        {people.map((person) => {
          const tone = STATUS[person.status] || STATUS.due;
          return (
            <div
              key={person.id}
              className={`flex-shrink-0 flex items-center gap-2 pl-2.5 pr-3 py-1.5 rounded-full border ${tone.className}`}
            >
              <span className="text-xs font-semibold truncate max-w-[7rem]">{person.name}</span>
              <span className="text-[10px] uppercase tracking-wide opacity-80">{tone.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
