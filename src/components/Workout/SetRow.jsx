import { useEffect, useRef, useState } from 'react';
import { Check, Minus, Plus, X } from 'lucide-react';

const STEP_LBS = 5;

/**
 * Individual set row with toggle, editable weight, and log-on-tap.
 *
 * Two interaction surfaces share the row:
 *  - Tap the weight text → enters inline edit mode (stepper + input + reset).
 *  - Tap anywhere else → logs the set (at current displayed weight).
 * Edit mode blocks the log tap so the two never collide.
 */
export default function SetRow({
  setIndex,
  percentage,
  prescribedWeight,
  weightOverride,
  reps,
  isLogged,
  isWorkoutComplete,
  exerciseName,
  onLogSet,
  onAddMax,
  onWeightChange,
}) {
  const isDisabled = isWorkoutComplete;
  const hasPrescribedWeight = prescribedWeight != null;
  const hasLoggedWeight = weightOverride != null;
  const hasWeight = hasPrescribedWeight || hasLoggedWeight;
  const displayedWeight = weightOverride ?? prescribedWeight;
  const isAdjusted = hasPrescribedWeight && weightOverride != null && weightOverride !== prescribedWeight;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(displayedWeight ?? 0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  // If the set gets logged or the workout is completed while editing, close the editor.
  useEffect(() => {
    if (editing && (isLogged || isWorkoutComplete)) setEditing(false);
  }, [isLogged, isWorkoutComplete, editing]);

  function openEditor(e) {
    e.stopPropagation();
    if (isDisabled || isLogged || !onWeightChange) return;
    setDraft(displayedWeight ?? 0);
    setEditing(true);
  }

  function commitDraft() {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setEditing(false);
      return;
    }
    if (hasPrescribedWeight && parsed === prescribedWeight) {
      onWeightChange?.(null); // snap back → clear override
    } else {
      onWeightChange?.(parsed);
    }
    setEditing(false);
  }

  function cancelEdit(e) {
    e?.stopPropagation();
    e?.preventDefault(); // prevent blur race on the input
    setEditing(false);
  }

  function bump(delta, e) {
    e.stopPropagation();
    const next = Math.max(0, Number(draft || 0) + delta);
    setDraft(next);
    // Commit immediately so every tap persists (no blur race)
    if (hasPrescribedWeight && next === prescribedWeight) {
      onWeightChange?.(null);
    } else {
      onWeightChange?.(next);
    }
  }

  function resetToPrescribed(e) {
    e.stopPropagation();
    e.preventDefault(); // prevent blur race on the input
    onWeightChange?.(null);
    setEditing(false);
  }

  const rowClickable = !isDisabled && !editing;

  return (
    <div
      onClick={rowClickable ? onLogSet : undefined}
      className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
        isLogged
          ? 'bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/30'
          : 'bg-zinc-800/40 hover:bg-zinc-800/60'
      } ${rowClickable ? 'cursor-pointer' : ''} ${isWorkoutComplete ? 'opacity-75' : ''}`}
    >
      <div
        className={`w-8 h-8 rounded-lg flex items-center justify-center ${
          isLogged
            ? 'bg-green-500 text-white'
            : isDisabled
              ? 'bg-zinc-700'
              : 'bg-zinc-700 hover:bg-zinc-600'
        }`}
      >
        {isLogged ? (
          <Check className="w-5 h-5" />
        ) : (
          <span className="text-sm font-bold">{setIndex + 1}</span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        {editing ? (
          <div
            className="flex items-center gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={(e) => bump(-STEP_LBS, e)}
              className="w-8 h-8 rounded-lg bg-zinc-700 hover:bg-zinc-600 flex items-center justify-center"
              aria-label={`Decrease by ${STEP_LBS} lbs`}
            >
              <Minus className="w-4 h-4" />
            </button>
            <input
              ref={inputRef}
              type="number"
              inputMode="numeric"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitDraft(); }
                if (e.key === 'Escape') { e.preventDefault(); cancelEdit(e); }
              }}
              onBlur={commitDraft}
              className="w-20 bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1 text-lg font-bold text-center focus:outline-none focus:border-orange-500"
            />
            <button
              type="button"
              onClick={(e) => bump(STEP_LBS, e)}
              className="w-8 h-8 rounded-lg bg-zinc-700 hover:bg-zinc-600 flex items-center justify-center"
              aria-label={`Increase by ${STEP_LBS} lbs`}
            >
              <Plus className="w-4 h-4" />
            </button>
            <span className="text-xs text-zinc-400">lbs</span>
            {(isAdjusted || (!hasPrescribedWeight && hasLoggedWeight)) && (
              <button
                type="button"
                onClick={resetToPrescribed}
                className="ml-1 text-xs text-zinc-400 hover:text-orange-400 underline underline-offset-2"
              >
                {hasPrescribedWeight ? `Reset to ${prescribedWeight}` : 'Clear weight'}
              </button>
            )}
            <button
              type="button"
              onClick={cancelEdit}
              className="ml-auto w-7 h-7 rounded-lg hover:bg-zinc-700 flex items-center justify-center"
              aria-label="Close editor"
            >
              <X className="w-4 h-4 text-zinc-400" />
            </button>
          </div>
        ) : (
          <div className="flex items-baseline gap-2 flex-wrap">
            {hasWeight ? (
              <>
                <button
                  type="button"
                  onClick={openEditor}
                  disabled={isDisabled || isLogged || !onWeightChange}
                  className={`text-lg font-bold ${
                    !isDisabled && !isLogged && onWeightChange
                      ? 'hover:text-orange-400 transition-colors underline decoration-dotted decoration-zinc-600 underline-offset-4'
                      : ''
                  }`}
                  title={!isLogged && onWeightChange ? 'Tap to adjust weight' : undefined}
                >
                  {displayedWeight} lbs
                </button>
                {percentage != null && (
                  <span className="text-xs text-zinc-400">@ {percentage}% 1RM</span>
                )}
                {isAdjusted && (
                  <span
                    className={`text-xs font-medium px-1.5 py-0.5 rounded-md ${
                      weightOverride < prescribedWeight
                        ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                        : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                    }`}
                  >
                    {weightOverride < prescribedWeight ? '↓' : '↑'}{' '}
                    {Math.abs(weightOverride - prescribedWeight)} lbs
                  </span>
                )}
              </>
            ) : percentage ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isDisabled && onAddMax) onAddMax();
                }}
                className={`flex items-baseline gap-2 ${
                  !isDisabled ? 'hover:text-orange-400 transition-colors' : ''
                }`}
                disabled={isDisabled}
              >
                <span className="text-zinc-400">{percentage}% of 1RM</span>
                {!isDisabled && (
                  <span className="text-xs text-orange-500 font-medium">+ Add Max</span>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={openEditor}
                disabled={isDisabled || isLogged || !onWeightChange}
                className={`inline-flex items-center gap-2 text-zinc-400 ${
                  !isDisabled && !isLogged && onWeightChange
                    ? 'hover:text-orange-400 transition-colors underline decoration-dotted decoration-zinc-600 underline-offset-4'
                    : ''
                }`}
                title={!isLogged && onWeightChange ? 'Tap to enter actual weight' : undefined}
              >
                <span>Bodyweight / As prescribed</span>
                {!isDisabled && !isLogged && onWeightChange && (
                  <span className="text-xs text-orange-500 font-medium">+ Weight</span>
                )}
              </button>
            )}
          </div>
        )}
      </div>
      {(() => {
        // Defensive: reps can be a long string (e.g. "5 warmup, 3 warmup, then 1 rep
        // attempts until form breaks") if an upstream agent stuffed warmup/cue text
        // into the reps field. Cap visible width and tooltip the full text.
        const repsText = reps == null ? '' : String(reps);
        const REPS_VISIBLE_MAX = 16;
        const truncated = repsText.length > REPS_VISIBLE_MAX
          ? `${repsText.slice(0, REPS_VISIBLE_MAX - 1)}…`
          : repsText;
        return (
          <span
            className="text-sm text-zinc-400 font-medium whitespace-nowrap"
            title={repsText.length > REPS_VISIBLE_MAX ? repsText : undefined}
          >
            {truncated}
          </span>
        );
      })()}
    </div>
  );
}
