import { useId, useState } from 'react';
import { AlertCircle, Check, Loader2, Minus, Pause, Pencil, Play, Plus, RotateCcw, Timer, Trophy } from 'lucide-react';
import { useBlockTimer } from '../../hooks/useBlockTimer';
import { blockTimerKey } from '../../utils/blockTimerStorage';
import { BLOCK_DATA_STATUS } from '../../hooks/useBlockScores';
import { TIMER_STATUS, formatClock } from '../../utils/blockTimer';
import { formatBlockScore } from '../../utils/workoutBlocks';
import {
  blockBadgeLabel,
  cleanCountInput,
  draftFromScore,
  emptyDraft,
  isNewBest,
  numberToBeatLabel,
  stepCount,
} from '../../utils/blockScoreEntry';
import { BLOCK_SCORE_NOTE_MAX } from '../../lib/validation';

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500';
const FIELD = `w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-white placeholder:text-zinc-500 ${FOCUS}`;
const SECONDARY_BTN = `inline-flex items-center justify-center gap-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 px-3 py-2 text-sm font-medium text-zinc-200 transition-colors ${FOCUS}`;
const PRIMARY_BTN = `inline-flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-orange-500 to-red-500 px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 ${FOCUS}`;

function CountStepper({ label, value, onChange }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-zinc-400 mb-1">{label}</label>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onChange(stepCount(value, -1))}
          aria-label={`Fewer ${label.toLowerCase()}`}
          className={`p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 ${FOCUS}`}
        >
          <Minus className="w-4 h-4" aria-hidden="true" />
        </button>
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={value}
          onChange={(event) => onChange(cleanCountInput(event.target.value))}
          placeholder="0"
          className={`${FIELD} text-center tabular-nums`}
        />
        <button
          type="button"
          onClick={() => onChange(stepCount(value, 1))}
          aria-label={`More ${label.toLowerCase()}`}
          className={`p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 ${FOCUS}`}
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function BlockTimer({ capMinutes, storageKey }) {
  const { status, secondsLeft, progress, start, pause, reset } = useBlockTimer(capMinutes, storageKey);
  const running = status === TIMER_STATUS.RUNNING;
  const finished = status === TIMER_STATUS.FINISHED;

  return (
    <div className="rounded-xl bg-zinc-950/60 border border-zinc-800 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div
            role="timer"
            aria-label={`Time left in the ${capMinutes} minute cap`}
            className={`text-3xl font-bold tabular-nums leading-none ${finished ? 'text-red-400' : secondsLeft <= 10 && running ? 'text-orange-400' : 'text-white'}`}
          >
            {formatClock(secondsLeft)}
          </div>
          <div className="text-xs text-zinc-500 mt-1">{finished ? 'Time is up' : 'time cap'}</div>
        </div>
        <div className="flex items-center gap-2">
          {running ? (
            <button type="button" onClick={pause} className={SECONDARY_BTN}>
              <Pause className="w-4 h-4" aria-hidden="true" />
              Pause
            </button>
          ) : (
            <button type="button" onClick={start} disabled={finished} className={`${PRIMARY_BTN} px-3`}>
              <Play className="w-4 h-4" aria-hidden="true" />
              {status === TIMER_STATUS.PAUSED ? 'Resume' : 'Start'}
            </button>
          )}
          <button type="button" onClick={reset} disabled={status === TIMER_STATUS.IDLE} className={`${SECONDARY_BTN} disabled:opacity-40`}>
            <RotateCcw className="w-4 h-4" aria-hidden="true" />
            Reset
          </button>
        </div>
      </div>
      <div className="h-1 rounded-full bg-zinc-800 overflow-hidden mt-3" aria-hidden="true">
        <div
          className="h-full bg-gradient-to-r from-orange-500 to-red-500 transition-[width] duration-200 ease-linear motion-reduce:transition-none"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>
      <p className="sr-only" aria-live="polite">{finished ? 'Time is up.' : ''}</p>
    </div>
  );
}

function ScoreForm({ block, draft, onChange, onSave, onCancel, saving, error }) {
  const noteId = useId();
  const finishId = useId();
  const set = (patch) => onChange({ ...draft, ...patch });
  const isAmrap = block.type === 'amrap';
  const showCappedFields = !isAmrap && draft.capped;

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      {isAmrap || showCappedFields ? (
        <div className="grid grid-cols-2 gap-3">
          <CountStepper label="Rounds" value={draft.rounds} onChange={(rounds) => set({ rounds })} />
          <CountStepper label={isAmrap ? 'Extra reps' : 'Reps in the last round'} value={draft.reps} onChange={(reps) => set({ reps })} />
        </div>
      ) : (
        <div>
          <label htmlFor={finishId} className="block text-xs font-medium text-zinc-400 mb-1">Finish time (m:ss)</label>
          <input
            id={finishId}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={draft.finish}
            onChange={(event) => set({ finish: event.target.value.replace(/[^\d:]/g, '').slice(0, 8) })}
            placeholder="11:42"
            className={`${FIELD} tabular-nums`}
          />
        </div>
      )}

      {!isAmrap && (
        <button
          type="button"
          role="switch"
          aria-checked={draft.capped}
          onClick={() => set({ capped: !draft.capped })}
          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium border transition-colors ${FOCUS} ${
            draft.capped ? 'bg-red-500/10 border-red-500/40 text-red-300' : 'bg-zinc-800 border-zinc-700 text-zinc-300'
          }`}
        >
          <span
            aria-hidden="true"
            className={`w-4 h-4 rounded border flex items-center justify-center ${draft.capped ? 'bg-red-500 border-red-500' : 'border-zinc-500'}`}
          >
            {draft.capped && <Check className="w-3 h-3 text-white" />}
          </span>
          Hit the cap
        </button>
      )}

      <div>
        <label htmlFor={noteId} className="block text-xs font-medium text-zinc-400 mb-1">Note (optional)</label>
        <textarea
          id={noteId}
          rows={2}
          maxLength={BLOCK_SCORE_NOTE_MAX}
          value={draft.note}
          onChange={(event) => set({ note: event.target.value })}
          placeholder="How did it feel?"
          className={`${FIELD} resize-none`}
        />
      </div>

      {error && (
        <p role="alert" className="flex items-start gap-1.5 text-sm text-red-400">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button type="submit" disabled={saving} className={PRIMARY_BTN}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Check className="w-4 h-4" aria-hidden="true" />}
          {saving ? 'Saving…' : 'Save score'}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={saving} className={SECONDARY_BTN}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

/**
 * One scored block (AMRAP / For Time) in place of its movements: badge, notes,
 * movement list, cap countdown and a single score entry. Every rule (parsing,
 * validation, the per-movement logs) lives in utils and useBlockScores.
 *
 * Props:
 *   block        - valid block from getDayBlocks
 *   movements    - [{ exercise, index }] in block order
 *   score        - saved score row for this day, or null
 *   previous     - best earlier score for the same benchmark, or null
 *   status       - BLOCK_DATA_STATUS of this week's scores
 *   historyStatus- BLOCK_DATA_STATUS of the benchmark history
 *   onSave       - (block, draft) => Promise<{ ok, error? }>
 *   onRetry      - reload scores after a failed load
 *   userId/week/day - identify this block instance so its timer survives a reload
 */
export default function WorkoutBlockCard({
  block,
  movements,
  score = null,
  previous = null,
  status = BLOCK_DATA_STATUS.READY,
  historyStatus = BLOCK_DATA_STATUS.READY,
  onSave,
  onRetry,
  userId = null,
  week = null,
  day = null,
}) {
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const showForm = status === BLOCK_DATA_STATUS.READY && (editing ?? !score);
  const showSaved = status === BLOCK_DATA_STATUS.READY && score && !showForm;
  const beatPrevious = isNewBest(score, previous);

  const beginEdit = () => {
    setDraft(draftFromScore(score));
    setError(null);
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const result = await onSave(block, draft);
    setSaving(false);
    if (result.ok) setEditing(false);
    else setError(result.error);
  };

  return (
    <section
      aria-label={block.title}
      className={`bg-zinc-900/50 rounded-2xl border overflow-hidden ${score ? 'border-green-500/30' : 'border-orange-500/30'}`}
    >
      <div className="p-5 space-y-4">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-500/10 border border-orange-500/30 px-2.5 py-1 text-xs font-semibold text-orange-300">
            <Timer className="w-3.5 h-3.5" aria-hidden="true" />
            {blockBadgeLabel(block)}
          </span>
          <h4 className="font-bold text-lg leading-tight mt-2">{block.title}</h4>
          {block.notes && (
            <p className="text-sm text-zinc-400 mt-2 whitespace-pre-line break-words">{block.notes}</p>
          )}
        </div>

        <ul className="divide-y divide-zinc-800/80 rounded-xl bg-zinc-800/30 px-3">
          {movements.map(({ exercise, index }) => (
            <li key={index} className="flex items-baseline justify-between gap-3 py-2">
              <span className="text-sm font-medium text-white break-words min-w-0">{exercise.name}</span>
              <span className="text-sm text-zinc-300 tabular-nums flex-shrink-0">
                {exercise.reps != null && String(exercise.reps)}
                {exercise.weight_lbs ? ` · ${exercise.weight_lbs} lb` : ''}
              </span>
            </li>
          ))}
        </ul>

        <BlockTimer
          capMinutes={block.time_cap_min}
          storageKey={blockTimerKey({ userId, week, day, blockId: block.id })}
        />

        {historyStatus === BLOCK_DATA_STATUS.ERROR && (
          <p className="text-xs text-zinc-500">Could not load your earlier scores, so there is no number to beat yet.</p>
        )}
        {previous && (
          <p className="flex items-center gap-1.5 text-sm font-medium text-orange-300">
            <Trophy className="w-4 h-4" aria-hidden="true" />
            {numberToBeatLabel(previous)}
          </p>
        )}

        {status === BLOCK_DATA_STATUS.LOADING && (
          <p className="flex items-center gap-2 text-sm text-zinc-400" role="status">
            <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            Loading your score…
          </p>
        )}

        {status === BLOCK_DATA_STATUS.ERROR && (
          <div role="alert" className="flex items-center justify-between gap-3 rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2">
            <p className="flex items-center gap-1.5 text-sm text-red-300">
              <AlertCircle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
              Could not load your score.
            </p>
            <button type="button" onClick={onRetry} className={SECONDARY_BTN}>Try again</button>
          </div>
        )}

        {showForm && (
          <ScoreForm
            block={block}
            draft={draft}
            onChange={setDraft}
            onSave={handleSave}
            onCancel={score ? () => { setEditing(false); setError(null); } : null}
            saving={saving}
            error={error}
          />
        )}

        {showSaved && (
          <div className="rounded-xl bg-green-500/10 border border-green-500/20 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium text-green-400">Your score</p>
                <p className="text-xl font-bold text-white tabular-nums break-words">{formatBlockScore(score)}</p>
                {beatPrevious && (
                  <p className="inline-flex items-center gap-1 mt-1 text-sm font-semibold text-orange-300">
                    <Trophy className="w-4 h-4" aria-hidden="true" />
                    New best
                  </p>
                )}
                {score.note && <p className="text-sm text-zinc-400 mt-2 whitespace-pre-line break-words">{score.note}</p>}
              </div>
              <button type="button" onClick={beginEdit} className={SECONDARY_BTN}>
                <Pencil className="w-4 h-4" aria-hidden="true" />
                Edit
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
