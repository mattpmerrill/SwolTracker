import { useCallback, useEffect, useMemo, useState } from 'react';
import { db } from '../lib/supabase';
import { reportWriteFailure } from '../lib/errorService';
import { blockScoreSchema, validate } from '../lib/validation';
import { getDayBlocks, bestPreviousScore } from '../utils/workoutBlocks';
import {
  blockScoreKey,
  buildBlockMovementLogs,
  buildBlockScoreInput,
  cleanBlockScore,
  indexBlockScores,
} from '../utils/blockScoreEntry';

export const BLOCK_DATA_STATUS = {
  IDLE: 'idle',
  LOADING: 'loading',
  READY: 'ready',
  ERROR: 'error',
};

const SAVE_FAILED = 'Could not save your score. Check your connection and try again.';

/**
 * Scored-block state for the week on screen: this week's saved scores, the
 * earlier scores that make the "number to beat", and the save path.
 *
 * Nothing is fetched until the viewed week actually has a block, so weeks
 * without blocks never touch workout_block_scores.
 *
 * `logSet` is the raw set logger from useWorkoutLogger, not the PR-detecting
 * wrapper in AuthenticatedShell: 60 reps of cleans at 95 lb is not a 1RM.
 */
export function useBlockScores({ currentUser, gymId, currentWeek, currentDay, weekProgram, toast, logSet }) {
  const [weekState, setWeekState] = useState({ scope: null, status: BLOCK_DATA_STATUS.LOADING, byKey: {} });
  const [historyState, setHistoryState] = useState({ scope: null, status: BLOCK_DATA_STATUS.LOADING, rows: [] });
  const [reloadTick, setReloadTick] = useState(0);

  const dayProgram = weekProgram?.[currentDay];
  const dayBlocks = useMemo(() => getDayBlocks(dayProgram), [dayProgram]);
  const weekHasBlocks = useMemo(
    () => Object.values(weekProgram || {}).some((day) => getDayBlocks(day).length > 0),
    [weekProgram],
  );
  const benchmarkKey = useMemo(
    () => [...new Set(dayBlocks.map((b) => b.benchmark).filter(Boolean))].sort().join(','),
    [dayBlocks],
  );

  const weekEnabled = Boolean(currentUser && gymId && weekHasBlocks);
  const weekScope = `${currentUser}|${gymId}|${currentWeek}`;
  const historyEnabled = Boolean(currentUser && benchmarkKey);
  const historyScope = `${currentUser}|${currentWeek}|${benchmarkKey}`;

  useEffect(() => {
    if (!weekEnabled) return undefined;
    let active = true;
    db.getBlockScoresForWeek(currentUser, gymId, currentWeek).then((rows) => {
      if (!active) return;
      setWeekState(rows === null
        ? { scope: weekScope, status: BLOCK_DATA_STATUS.ERROR, byKey: {} }
        : { scope: weekScope, status: BLOCK_DATA_STATUS.READY, byKey: indexBlockScores(rows) });
    });
    return () => { active = false; };
  }, [weekEnabled, weekScope, currentUser, gymId, currentWeek, reloadTick]);

  useEffect(() => {
    if (!historyEnabled) return undefined;
    let active = true;
    db.getBenchmarkScores(currentUser, benchmarkKey.split(','), currentWeek).then((rows) => {
      if (!active) return;
      setHistoryState(rows === null
        ? { scope: historyScope, status: BLOCK_DATA_STATUS.ERROR, rows: [] }
        : { scope: historyScope, status: BLOCK_DATA_STATUS.READY, rows });
    });
    return () => { active = false; };
  }, [historyEnabled, historyScope, currentUser, benchmarkKey, currentWeek, reloadTick]);

  let status = BLOCK_DATA_STATUS.IDLE;
  if (weekEnabled) status = weekState.scope === weekScope ? weekState.status : BLOCK_DATA_STATUS.LOADING;
  let historyStatus = BLOCK_DATA_STATUS.IDLE;
  if (historyEnabled) historyStatus = historyState.scope === historyScope ? historyState.status : BLOCK_DATA_STATUS.LOADING;

  const scoreFor = useCallback((blockId) => {
    if (weekState.scope !== weekScope) return null;
    return weekState.byKey[blockScoreKey(currentDay, blockId)] ?? null;
  }, [weekState, weekScope, currentDay]);

  const previousFor = useCallback((block) => {
    if (historyStatus !== BLOCK_DATA_STATUS.READY) return null;
    return bestPreviousScore(historyState.rows, block.benchmark, block.type, currentWeek);
  }, [historyStatus, historyState.rows, currentWeek]);

  const reload = useCallback(() => setReloadTick((tick) => tick + 1), []);

  /** Resolves { ok: true } or { ok: false, error } with text the card can show inline. */
  const saveScore = useCallback(async (block, draft) => {
    const checked = validate(blockScoreSchema, buildBlockScoreInput(block, draft));
    if (!checked.success) return { ok: false, error: checked.error };
    const score = cleanBlockScore(checked.data);

    const week = currentWeek;
    const day = currentDay;
    const scope = weekScope;
    const key = blockScoreKey(day, block.id);
    const before = weekState.scope === scope ? weekState.byKey[key] : undefined;

    const writeRow = (row) => setWeekState((prev) => {
      if (prev.scope !== scope) return prev;
      const byKey = { ...prev.byKey };
      if (row === undefined) delete byKey[key];
      else byKey[key] = row;
      return { ...prev, byKey };
    });

    writeRow({ ...before, ...score, user_id: currentUser, gym_id: gymId, week_number: week, day_name: day });

    let saved = null;
    let failure = null;
    try {
      saved = await db.upsertBlockScore(currentUser, gymId, week, day, score);
    } catch (error) {
      failure = error;
    }

    if (!saved) {
      writeRow(before);
      await reportWriteFailure({
        db,
        toast,
        userId: currentUser,
        component: 'useBlockScores.js',
        operation: 'upsertBlockScore',
        message: failure?.message || 'upsertBlockScore returned null',
        userMessage: SAVE_FAILED,
        originalError: failure,
        context: { week, day, blockId: block.id },
      });
      return { ok: false, error: SAVE_FAILED };
    }
    writeRow(saved);

    // Completion ring, streaks and the offline queue count set logs, so each
    // movement gets its set-0 log through the same path as a tapped set.
    const exercises = dayProgram?.exercises ?? [];
    for (const { exerciseIndex, setIndex, data } of buildBlockMovementLogs(block, exercises, score)) {
      await logSet(exerciseIndex, setIndex, data);
    }
    return { ok: true };
  }, [currentUser, gymId, currentWeek, currentDay, weekScope, weekState, dayProgram, toast, logSet]);

  return { status, historyStatus, scoreFor, previousFor, saveScore, reload };
}
