import { useEffect, useRef, useState } from 'react';
import { CalendarClock, Check, Loader2, AlertTriangle } from 'lucide-react';

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/**
 * Chad noticed a planned workout went unlogged and offers to move it to a rest day later in the
 * week. Nothing moves until the user taps. `view` comes from buildOfferView (utils/checkinView.js).
 */
export default function ChadMissedDayCard({ view, busy, error, focused, onAnswer, onFocusHandled }) {
  const rootRef = useRef(null);
  const [activeAction, setActiveAction] = useState(null);

  useEffect(() => {
    if (!focused || !rootRef.current) return;
    rootRef.current.scrollIntoView?.({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' });
    rootRef.current.focus?.({ preventScroll: true });
    onFocusHandled?.();
  }, [focused, onFocusHandled]);

  const working = busy === 'offer';
  const run = async (action, accept) => {
    setActiveAction(action);
    await onAnswer(accept);
    setActiveAction(null);
  };
  const cardError = error && error.id === view.id ? error.message : null;

  return (
    <section
      ref={rootRef}
      id={`offer-${view.id}`}
      tabIndex={-1}
      aria-label={view.title}
      className="scroll-mt-20 rounded-2xl border border-orange-500/30 bg-gradient-to-br from-orange-500/10 to-red-500/5 p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
    >
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shrink-0 shadow-lg shadow-orange-500/20">
          <CalendarClock className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-white leading-snug">{view.title}</h3>
          <p className="text-sm text-zinc-400 mt-0.5">
            Want me to move it to {view.toDay} so you don't lose the week's work?
          </p>
        </div>
      </div>

      {cardError && (
        <p role="alert" className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          <span>{cardError}</span>
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => run('accept', true)}
          disabled={working}
          className="inline-flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 text-white text-sm font-semibold hover:from-orange-400 hover:to-red-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
        >
          {working && activeAction === 'accept'
            ? <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" />
            : <Check className="w-4 h-4" />}
          {view.acceptLabel}
        </button>
        <button
          type="button"
          onClick={() => run('decline', false)}
          disabled={working}
          className="inline-flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm font-medium hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500"
        >
          {working && activeAction === 'decline' ? <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" /> : null}
          {view.declineLabel}
        </button>
      </div>
    </section>
  );
}
