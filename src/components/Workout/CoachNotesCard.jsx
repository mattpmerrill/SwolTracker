import { useId, useState } from 'react';
import { ChevronDown, ClipboardList } from 'lucide-react';

/**
 * The coach's notes for the day. Open until the lifter logs a first set, then
 * collapsed so the sets get the screen; a tap on the header overrides either way.
 * The parent keys this by week and day so the override resets when the day changes.
 */
export default function CoachNotesCard({ notes, hasLoggedSet = false }) {
  const [userOpen, setUserOpen] = useState(null);
  const bodyId = useId();
  const open = userOpen ?? !hasLoggedSet;

  if (!notes) return null;

  return (
    <section className="bg-zinc-900/60 border border-orange-500/20 rounded-2xl overflow-hidden" aria-label="Coach's notes">
      <h3>
        <button
          type="button"
          onClick={() => setUserOpen(!open)}
          aria-expanded={open}
          aria-controls={bodyId}
          className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left rounded-2xl hover:bg-zinc-800/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-white">
            <ClipboardList className="w-4 h-4 text-orange-400" aria-hidden="true" />
            Coach&apos;s notes
          </span>
          <ChevronDown
            className={`w-4 h-4 text-zinc-500 transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>
      </h3>
      {open && (
        <div id={bodyId} className="px-4 pb-4 -mt-1">
          <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-line break-words">{notes}</p>
        </div>
      )}
    </section>
  );
}
