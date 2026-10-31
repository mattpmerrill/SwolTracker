import { useEffect, useRef, useState } from 'react';
import { Dumbbell, Check, X, Loader2, ChevronDown, Clock, MessageCircle, AlertTriangle } from 'lucide-react';
import DayDiff from './DayDiff';
import {
  applyButtonLabel,
  defaultSelectedIds,
  pruneSelected,
  toggleSelected,
} from '../../utils/checkinView';

const PRIMARY_BUTTON =
  'inline-flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 text-white text-sm font-semibold hover:from-orange-400 hover:to-red-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400';
const SECONDARY_BUTTON =
  'inline-flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm font-medium hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500';

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

function Spinner() {
  return <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" />;
}

function BulletList({ title, items, tone }) {
  if (items.length === 0) return null;
  const marker = tone === 'win' ? 'bg-emerald-400' : 'bg-amber-400';
  return (
    <div className="mt-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">{title}</p>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={`${item}-${i}`} className="flex gap-2 text-sm text-zinc-300 leading-snug">
            <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${marker}`} aria-hidden="true" />
            <span className="min-w-0 break-words">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChangeRow({ change, checked, expanded, disabled, onToggle, onExpand }) {
  const detailsId = `checkin-change-${change.id}`;
  return (
    <li className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
      <div className="flex items-start gap-3">
        <input
          id={`${detailsId}-box`}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={onToggle}
          className="mt-1 h-4 w-4 shrink-0 rounded accent-orange-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
        />
        <div className="min-w-0 flex-1">
          <label htmlFor={`${detailsId}-box`} className="block cursor-pointer">
            <span className="text-xs font-semibold uppercase tracking-wider text-orange-400">{change.day}</span>
            <span className="block text-sm text-zinc-100 mt-0.5 leading-snug break-words">{change.summary}</span>
          </label>
          {change.reason && <p className="text-xs text-zinc-500 mt-1 leading-snug break-words">{change.reason}</p>}
          <button
            type="button"
            onClick={onExpand}
            aria-expanded={expanded}
            aria-controls={detailsId}
            className="mt-2 inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 rounded"
          >
            {expanded ? 'Hide' : 'Show'} before and after
            <ChevronDown className={`w-3.5 h-3.5 transition-transform motion-reduce:transition-none ${expanded ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>
      {expanded && (
        <div id={detailsId} className="mt-3">
          <DayDiff before={change.before} after={change.after} />
        </div>
      )}
    </li>
  );
}

/**
 * Chad's weekly check-in: a recap of the week that ended and up to four proposed changes to the next
 * one. Nothing is saved until the user applies. Lives above the "Ask Chad" entry on the workout
 * screen. `view` comes from buildCheckinView (utils/checkinView.js); the actions come from useCheckin.
 */
export default function ChadCheckinCard({ view, busy, error, focused, onDecide, onTalk, onDismiss, onFocusHandled }) {
  const rootRef = useRef(null);
  const [expanded, setExpanded] = useState({});
  // The ticks belong to one check-in. A different id (or a refreshed set of changes) starts over
  // from "all ticked" rather than carrying stale ids into acceptIds.
  const [selection, setSelection] = useState({ id: view.id, ids: defaultSelectedIds(view.changes) });
  const selectedIds = selection.id === view.id ? pruneSelected(selection.ids, view.changes) : defaultSelectedIds(view.changes);

  // A push deep link asked for this card: bring it into view and move keyboard focus to it.
  useEffect(() => {
    if (!focused || !rootRef.current) return;
    rootRef.current.scrollIntoView?.({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' });
    rootRef.current.focus?.({ preventScroll: true });
    onFocusHandled?.();
  }, [focused, onFocusHandled]);

  const working = busy === 'checkin';
  const [activeAction, setActiveAction] = useState(null);
  const run = async (action, ids) => {
    setActiveAction(action);
    await onDecide(ids);
    setActiveAction(null);
  };

  const toggle = (changeId) => setSelection({
    id: view.id,
    ids: toggleSelected(selectedIds, changeId, view.changes),
  });

  const cardError = error && error.id === view.id ? error.message : null;

  return (
    <section
      ref={rootRef}
      id={`checkin-${view.id}`}
      tabIndex={-1}
      aria-label={`Chad's Week ${view.reviewWeek} check-in`}
      className="scroll-mt-20 rounded-2xl border border-orange-500/30 bg-gradient-to-br from-orange-500/10 to-red-500/5 p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
    >
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shrink-0 shadow-lg shadow-orange-500/20">
          <Dumbbell className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-orange-400">
            Week {view.reviewWeek} check-in
          </p>
          <h3 className="font-semibold text-white leading-snug break-words">{view.headline}</h3>
          {view.open && view.expiryLabel && (
            <span className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 text-[11px] font-medium text-orange-300">
              <Clock className="w-3 h-3" aria-hidden="true" />
              {view.expiryLabel}
            </span>
          )}
        </div>
        {!view.open && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss check-in"
            className="shrink-0 p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <BulletList title="Wins" items={view.wins} tone="win" />
      <BulletList title="Keep an eye on" items={view.watch} tone="watch" />

      {view.open && view.changes.length > 0 && (
        <div className="mt-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">
            Proposed for Week {view.targetWeek}
          </p>
          <ul className="space-y-2">
            {view.changes.map((change) => (
              <ChangeRow
                key={change.id}
                change={change}
                checked={selectedIds.includes(change.id)}
                expanded={expanded[change.id] === true}
                disabled={working}
                onToggle={() => toggle(change.id)}
                onExpand={() => setExpanded((prev) => ({ ...prev, [change.id]: !prev[change.id] }))}
              />
            ))}
          </ul>
        </div>
      )}

      {cardError && (
        <p role="alert" className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          <span>{cardError}</span>
        </p>
      )}

      {view.open ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {view.ackOnly ? (
            <button
              type="button"
              onClick={() => run('ack', [])}
              disabled={working}
              className={PRIMARY_BUTTON}
            >
              {working && activeAction === 'ack' ? <Spinner /> : <Check className="w-4 h-4" />}
              Got it
            </button>
          ) : (
            <button
              type="button"
              onClick={() => run('apply', selectedIds)}
              disabled={working || selectedIds.length === 0}
              className={PRIMARY_BUTTON}
            >
              {working && activeAction === 'apply' ? <Spinner /> : <Check className="w-4 h-4" />}
              {applyButtonLabel(selectedIds.length)}
            </button>
          )}
          <button type="button" onClick={onTalk} disabled={working} className={SECONDARY_BUTTON}>
            <MessageCircle className="w-4 h-4" />
            Talk to Chad about it
          </button>
          {!view.ackOnly && (
            <button
              type="button"
              onClick={() => run('skip', [])}
              disabled={working}
              className="inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-zinc-400 text-sm font-medium hover:text-white hover:bg-zinc-800/60 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500"
            >
              {working && activeAction === 'skip' ? <Spinner /> : null}
              Skip this week
            </button>
          )}
        </div>
      ) : (
        <p role="status" className="mt-4 flex items-start gap-2 rounded-xl bg-zinc-950/50 border border-zinc-800 px-3 py-2.5 text-sm text-zinc-200">
          {view.status === 'failed' || view.status === 'expired'
            ? <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-400" aria-hidden="true" />
            : <Check className="w-4 h-4 mt-0.5 shrink-0 text-emerald-400" aria-hidden="true" />}
          <span>{view.resultSummary}</span>
        </p>
      )}
    </section>
  );
}
