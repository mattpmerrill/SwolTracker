import { useEffect, useRef, useState } from 'react';
import { Check, Minus, Plus, X } from 'lucide-react';
import { isRepsAdjusted, parseRepsDraft, toActualRepsValue } from '../../utils/workout';

const STEP_LBS = 5;
const STEP_REPS = 1;
const REPS_VISIBLE_MAX = 16;

/**
 * Individual set row with toggle, editable weight/reps, and log-on-tap.
 *
 * Interaction surfaces:
 *  - Tap the weight text → inline weight editor (stepper + input + reset).
 *  - Tap the reps text → inline reps editor (stepper + input + reset).
 *  - Tap anywhere else → logs the set (at current displayed weight/reps).
 * Edit mode blocks the log tap so the two never collide.
 */
export default function SetRow({
  setIndex,
  percentage,
  prescribedWeight,
  weightOverride,
  reps,
  repsOverride,
  isLogged,
  isWorkoutComplete,
  exerciseName,
  onLogSet,
  onAddMax,
  onWeightChange,
  onRepsChange,
}) {
  const isDisabled = isWorkoutComplete;
  const hasPrescribedWeight = prescribedWeight != null;
  const hasLoggedWeight = weightOverride != null;
  const hasWeight = hasPrescribedWeight || hasLoggedWeight;
  const displayedWeight = weightOverride ?? prescribedWeight;
  const isAdjusted = hasPrescribedWeight && weightOverride != null && weightOverride !== prescribedWeight;
  const repsAdjusted = isRepsAdjusted(reps, repsOverride);
  const prescribedRepsNumeric = toActualRepsValue(reps);

  const [editingField, setEditingField] = useState(null); // 'weight' | 'reps' | null
  const [draft, setDraft] = useState(displayedWeight ?? 0);
  const [repsDraft, setRepsDraft] = useState(parseRepsDraft(reps, repsOverride));
  const inputRef = useRef(null);

  useEffect(() => {
    if (editingField && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingField]);

  // If the set gets logged or the workout is completed while editing, close the editor.
  useEffect(() => {
    if (editingField && (isLogged || isWorkoutComplete)) setEditingField(null);
  }, [isLogged, isWorkoutComplete, editingField]);

  function openWeightEditor(e) {
    e.stopPropagation();
    if (isDisabled || isLogged || !onWeightChange) return;
    setDraft(displayedWeight ?? 0);
    setEditingField('weight');
  }

  function openRepsEditor(e) {
    e.stopPropagation();
    if (isDisabled || isLogged || !onRepsChange) return;
    setRepsDraft(parseRepsDraft(reps, repsOverride));
    setEditingField('reps');
  }

  function commitWeightDraft() {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setEditingField(null);
      return;
    }
    if (hasPrescribedWeight && parsed === prescribedWeight) {
      onWeightChange?.(null);
    } else {
      onWeightChange?.(parsed);
    }
    setEditingField(null);
  }

  function commitRepsDraft() {
    const parsed = Number(repsDraft);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setEditingField(null);
      return;
    }
    const next = Math.trunc(parsed);
    if (prescribedRepsNumeric != null && next === prescribedRepsNumeric) {
      onRepsChange?.(null);
    } else {
      onRepsChange?.(next);
    }
    setEditingField(null);
  }

  function cancelEdit(e) {
    e?.stopPropagation();
    e?.preventDefault();
    setEditingField(null);
  }

  function bumpWeight(delta, e) {
    e.stopPropagation();
    const next = Math.max(0, Number(draft || 0) + delta);
    setDraft(next);
    if (hasPrescribedWeight && next === prescribedWeight) {
      onWeightChange?.(null);
    } else {
      onWeightChange?.(next);
    }
  }

  function bumpReps(delta, e) {
    e.stopPropagation();
    const next = Math.max(0, Number(repsDraft || 0) + delta);
    setRepsDraft(next);
    if (prescribedRepsNumeric != null && next === prescribedRepsNumeric) {
      onRepsChange?.(null);
    } else if (next <= 0) {
      onRepsChange?.(null);
    } else {
      onRepsChange?.(next);
    }
  }

  function resetToPrescribed(e) {
    e.stopPropagation();
    e.preventDefault();
    onWeightChange?.(null);
    setEditingField(null);
  }

  function resetRepsToPrescribed(e) {
    e.stopPropagation();
    e.preventDefault();
    onRepsChange?.(null);
    setEditingField(null);
  }

  const rowClickable = !isDisabled && !editingField;

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
        {editingField === 'weight' ? (
          <div
            className="flex items-center gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={(e) => bumpWeight(-STEP_LBS, e)}
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
                if (e.key === 'Enter') { e.preventDefault(); commitWeightDraft(); }
                if (e.key === 'Escape') { e.preventDefault(); cancelEdit(e); }
              }}
              onBlur={commitWeightDraft}
              className="w-20 bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1 text-lg font-bold text-center focus:outline-none focus:border-orange-500"
            />
            <button
              type="button"
              onClick={(e) => bumpWeight(STEP_LBS, e)}
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
        ) : editingField === 'reps' ? (
          <div
            className="flex items-center gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={(e) => bumpReps(-STEP_REPS, e)}
              className="w-8 h-8 rounded-lg bg-zinc-700 hover:bg-zinc-600 flex items-center justify-center"
              aria-label={`Decrease by ${STEP_REPS} rep`}
            >
              <Minus className="w-4 h-4" />
            </button>
            <input
              ref={inputRef}
              type="number"
              inputMode="numeric"
              value={repsDraft}
              onChange={(e) => setRepsDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitRepsDraft(); }
                if (e.key === 'Escape') { e.preventDefault(); cancelEdit(e); }
              }}
              onBlur={commitRepsDraft}
              className="w-16 bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1 text-lg font-bold text-center focus:outline-none focus:border-orange-500"
            />
            <button
              type="button"
              onClick={(e) => bumpReps(STEP_REPS, e)}
              className="w-8 h-8 rounded-lg bg-zinc-700 hover:bg-zinc-600 flex items-center justify-center"
              aria-label={`Increase by ${STEP_REPS} rep`}
            >
              <Plus className="w-4 h-4" />
            </button>
            <span className="text-xs text-zinc-400">reps</span>
            {repsAdjusted && (
              <button
                type="button"
                onClick={resetRepsToPrescribed}
                className="ml-1 text-xs text-zinc-400 hover:text-orange-400 underline underline-offset-2"
              >
                {prescribedRepsNumeric != null ? `Reset to ${prescribedRepsNumeric}` : 'Clear reps'}
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
                  onClick={openWeightEditor}
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
                onClick={openWeightEditor}
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
      {editingField !== 'reps' && (() => {
        const repsText = repsOverride != null
          ? String(repsOverride)
          : (reps == null ? '' : String(reps));
        const truncated = repsText.length > REPS_VISIBLE_MAX
          ? `${repsText.slice(0, REPS_VISIBLE_MAX - 1)}…`
          : repsText;
        return (
          <button
            type="button"
            onClick={openRepsEditor}
            disabled={isDisabled || isLogged || !onRepsChange}
            className={`flex items-center gap-1.5 text-sm font-medium whitespace-nowrap ${
              !isDisabled && !isLogged && onRepsChange
                ? 'hover:text-orange-400 transition-colors'
                : 'text-zinc-400'
            }`}
            title={!isLogged && onRepsChange ? 'Tap to log actual reps' : (repsText.length > REPS_VISIBLE_MAX ? repsText : undefined)}
          >
            <span className={repsAdjusted ? 'font-bold text-white' : 'text-zinc-400'}>
              {truncated}
            </span>
            {repsAdjusted && prescribedRepsNumeric != null && (
              <span
                className={`text-xs font-medium px-1.5 py-0.5 rounded-md ${
                  repsOverride < prescribedRepsNumeric
                    ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                    : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                }`}
              >
                {repsOverride < prescribedRepsNumeric ? '↓' : '↑'}{' '}
                {Math.abs(repsOverride - prescribedRepsNumeric)}
              </span>
            )}
          </button>
        );
      })()}
    </div>
  );
}
