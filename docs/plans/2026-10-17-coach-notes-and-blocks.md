# Coach's notes and scored blocks (AMRAP / For Time)

> **For Hermes:** Opus 5.5 plans and reviews. Each task runs in a fresh Sonnet 5.5 subagent on its own branch and
> worktree. Opus reviews against this plan, reruns the Definition of Done, merges into the integration branch, or sends
> a fix worker.

**Why (Matt, 2026-10-17):** Week 38 Saturday "Forge Baseline AMRAP" showed four movements with reps like `10/rd AMRAP`
and nothing else. Matt and Wrenny could not tell how long to go or how to score it. The 12-minute cap only existed in a
Coach Board note. The app then logged the AMRAP as four separate sets with no reps, so there is no score to beat.

**Goal:** a program day can carry coach's notes, and a group of movements can be a scored block (AMRAP or For Time)
with a time cap, a timer, and one score entry. The score is stored, shown as the number to beat next time, and readable
by the agent.

**Branching:** integration branch `feat/coach-notes-blocks` off `main` (`287f0af`). Task N: branch
`feat/coach-notes-blocks-tN` off the current integration branch, worktree `~/Work/SwolTracker-wt/cnN`. One PR to `main`
at the end. **Merging to `main` deploys production and applying the migration touches production: both need Matt's OK.**

**Rules for every worker:** read `AGENTS.md` and `CLAUDE.md` first and follow them. Definition of Done after the last
edit: `npm run lint` (0 errors, no new warnings beyond 17), `npm test`, `npm run build`, `cd mcp && npm run build`,
`npm run knip`. Never touch production data, never apply a migration, never push to `main`, never print secrets, never
`git add -A`. Commit on your task branch only. Report: commits, files changed, test counts before/after, what you could
not do or verify (UI not seen in a browser must be said).

---

## Evidence (Opus, read-only, 2026-10-17)

- Baseline `main` `287f0af`: 359 tests pass, lint 0 errors / 17 warnings.
- `mcp/src/tools/actions.ts` `ExerciseSchema` accepts `note` (max 200), not `notes`. `z.object` strips unknown keys, so
  the agent's `notes` field (documented that way in the Joi skill) was silently dropped. `DaySchema` has only `focus`
  and `exercises`, so any day-level instruction is dropped too.
- `enrichExercises` in `mcp/src/tools/queries.ts` does not return `note`, so agents never see it.
- `ExerciseCard.jsx` renders `exercise.note` clamped to 3 lines. Nothing renders day-level notes.
- Saturday logs: the four AMRAP movements each have one row; three have `actual_reps` NULL, burpees 40. There is no
  place for "5 rounds + 22 reps".

## Data contract (all tasks build to this)

Program JSON (`workout_programs.program_data`, per day). All new fields are optional; old weeks keep working.

```jsonc
{
  "focus": "Forge Baseline AMRAP - SCORE IT",
  "coach_notes": "Warm up 5 min. Cleans first while fresh, then the 12-min AMRAP...",   // ≤ 1500 chars
  "exercises": [
    { "name": "Hang Power Cleans", "sets": 3, "reps": "3", "percentages": [60,65,65], "note": "Fast, crisp, no grinding" },
    { "name": "Hang Power Cleans", "sets": 1, "reps": "10/rd", "weight_lbs": 95 },
    { "name": "Push-Ups", "sets": 1, "reps": "12/rd" },
    { "name": "Bodyweight Squats", "sets": 1, "reps": "15/rd" },
    { "name": "Burpees", "sets": 1, "reps": "8/rd" }
  ],
  "blocks": [
    {
      "id": "forge",                  // /^[a-z0-9-]{1,32}$/, unique in the day
      "type": "amrap",                // "amrap" | "for_time"
      "title": "Forge AMRAP",         // ≤ 60
      "time_cap_min": 12,             // integer 1..90
      "exercise_indexes": [1, 2, 3, 4], // ≥ 1, valid indexes into exercises, no index in two blocks
      "rounds": 5,                    // for_time only, optional: prescribed rounds (e.g. "3 rounds for time")
      "benchmark": "forge",           // optional slug; same benchmark across weeks = the number to beat
      "notes": "Score = full rounds + extra reps. Pick a pace you can hold."  // ≤ 1000
    }
  ]
}
```

Exercise `note` max goes from 200 to 500. Block movements keep `sets: 1`; their `reps` is the per-round count.

Score row, new table `workout_block_scores` (migration `043`):

| column | type | rule |
| --- | --- | --- |
| id | uuid pk | |
| user_id | uuid not null → profiles(id) on delete cascade | |
| gym_id | uuid not null → gyms(id) on delete cascade | |
| week_number | int not null | ≥ 1 |
| day_name | text not null | Monday..Sunday |
| block_id | text not null | |
| benchmark | text null | copied from the block at save time |
| score_type | text not null | `amrap` or `for_time` |
| rounds | int null | ≥ 0 |
| reps | int null | ≥ 0 extra reps (AMRAP partial round, or reps done when capped on For Time) |
| time_seconds | int null | > 0, For Time finish time |
| capped | boolean not null default false | For Time not finished inside the cap |
| note | text null | ≤ 280 |
| created_at / updated_at | timestamptz default now() | |

Unique `(user_id, gym_id, week_number, day_name, block_id)`. Index `(user_id, benchmark)`. RLS on: a user selects,
inserts, updates and deletes only their own rows, and insert/update also require membership of `gym_id` in
`gym_members`. Header comment: what, why, how to verify, rollback.

Score validity: `amrap` needs `rounds` (reps defaults 0, `time_seconds` null). `for_time` needs either `time_seconds`
(finished, `capped=false`) or `capped=true` with `rounds`/`reps` done.

## Task 1 — Shared logic, migration 043, MCP (backend)

**Files:** create `shared/workout-blocks.ts`, `shared/__tests__/workout-blocks.test.ts`, `migrations/043-workout-block-scores.sql`;
modify `mcp/src/types.ts`, `mcp/src/tools/actions.ts`, `mcp/src/tools/queries.ts`, `mcp/src/sdk-adapter.ts`,
`mcp/src/register-tools.ts` (stdio parity), the matching contract/scope/sdk-adapter/openapi tests, `SKILL.md`.

**`shared/workout-blocks.ts`** (pure TS, no zod, no I/O; tests first):
- `getDayBlocks(day)`: valid blocks only (drops a block with a bad type, no valid indexes, or indexes already claimed);
  never throws on old or messy JSON.
- `buildDaySections(day)`: ordered list `{ kind: "exercise", index }` / `{ kind: "block", block, indexes }`; a block
  appears once, at the position of its first index; its movements are not repeated as exercises.
- `perRoundReps(reps)`: leading integer of `"10/rd"`, `"10/rd AMRAP"`, `"12"`, `12` → number; else null.
- `amrapMovementTotals(block, exercises, rounds, extraReps)`: `{ [exerciseIndex]: totalReps | null }` = rounds ×
  per-round + extra reps filled in movement order (extra 22 over 10/12/15/8 → +10, +12, +0, +0).
- `formatBlockScore(score)`: `"5 rounds + 22 reps"`, `"5 rounds"`, `"11:42"`, `"Capped: 4 rounds + 3 reps"`.
- `compareBlockScores(a, b)`: positive when `a` is better. AMRAP: more rounds, then more reps. For Time: finished beats
  capped; lower time wins; capped vs capped by rounds then reps. Mixed types → 0.
- `isValidBlockScore(type, score)`: the score validity rules above (Zod at the boundaries uses it in `refine`).

**MCP:**
- `DaySchema` adds `coach_notes` and `blocks` (Zod; `superRefine` checks indexes against `exercises.length` and no
  overlap). `ExerciseSchema.note` max 500. Check that `substitute_equipment_globally`, `rebuild_week_for_constraints`
  and any other program rewrite keep `coach_notes`/`blocks` (spread the day, do not rebuild it); pin with a test.
- `enrichExercises` returns `note` (or null) and `block_id` (or null).
- `get_todays_workout`: `data.coach_notes`, `data.blocks[]` (each with `score` for this day or null, and
  `best_previous` for the same benchmark in earlier weeks or null, both with a `display` string from
  `formatBlockScore`). The text message names each block, its cap, and the score if logged. `get_weekly_workout` adds
  `coach_notes` and `blocks` per day (no scores).
- New tool `log_block_score` (scope `write:logs`, category action): args `gym_id?`, `week_number?`, `day_name?`,
  `block_id`, `rounds?`, `reps?`, `time_seconds?`, `capped?`, `note?`. User id from the key; gym via the existing
  membership resolver (members may log against the leader's program, same as `log_set`); the block must exist in that
  day's program; validate with `isValidBlockScore`. Upsert the score row, then upsert the block movements' set 0 logs
  (`completed: true`, `actual_reps` from `amrapMovementTotals` for AMRAP, null for For Time, `actual_weight` = the
  prescribed weight) so completion and streaks count the work. Response: formatted score, previous best, and whether it
  beat it. Tool count 43 → 44 everywhere it is pinned.
- `get_training_history_summary`: a `Block scores:` section (week, day, title, display) when there are any.
- `SKILL.md`: document `coach_notes`, `blocks`, exercise `note` (singular, 500), and `log_block_score`. Tell agents:
  conditioning days MUST carry coach_notes and a block with a time cap; log the score with `log_block_score`, not
  per-set rows.

**Tests that must exist:** shared unit tests for every function above (including the 5+22 example); MCP contract tests
for the schema (a block pointing past the exercise list or reusing an index is rejected; old days without blocks still
save), for `get_todays_workout` returning notes/blocks/scores, for `log_block_score` (writes the score and the movement
logs; rejects an unknown block; rejects an AMRAP without rounds; a member can log), scope test for the new tool, and an
IDOR-style test that the user id never comes from arguments.

## Task 2 — Web: notes card, block card, score logging

**Depends on Task 1.** **Files:** create `src/utils/workoutBlocks.js` (re-export of shared, like `src/utils/e1rm.js`),
`src/lib/repositories/blockScores.js` + test, `src/hooks/useBlockScores.js`, `src/components/Workout/CoachNotesCard.jsx`,
`src/components/Workout/WorkoutBlockCard.jsx` (+ a small pure helper module with tests if any timer/score-entry logic
is needed, e.g. `src/utils/blockTimer.js`); modify `src/lib/supabase.js` (compose repo), `src/lib/validation.js`
(`blockScoreSchema`, zod 4, refine with `isValidBlockScore`), `src/components/Workout/index.js`,
`src/screens/WorkoutScreen.jsx`, `src/components/Workout/ExerciseCard.jsx` (note: allow "Show more" past 3 lines).

**Behavior:**
- `CoachNotesCard` at the top of the day when `coach_notes` exists: titled "Coach's notes", collapsible, open by default
  until the day has a logged set. Plain text with line breaks kept.
- The screen renders `buildDaySections(todayWorkout)`: normal exercises stay `ExerciseCard`; a block renders one
  `WorkoutBlockCard` in place of its movements.
- `WorkoutBlockCard`: badge `AMRAP · 12 min` or `For Time · 5 rounds · 15 min cap`; block notes; the movement list
  (name, per-round reps, weight when set); a countdown timer for the cap (start, pause, reset; uses the existing
  RestTimer beep/vibrate pattern; honors `prefers-reduced-motion`; timer math in a pure helper with tests); score entry
  (AMRAP: rounds and extra reps steppers; For Time: mm:ss or a "Hit the cap" toggle with rounds + reps); a note field;
  Save. Shows "Number to beat: 5 rounds + 22 reps (Week 37)" from the benchmark history, and after saving "New best"
  when it beats it. A saved score shows read-only with Edit.
- Save path (`useBlockScores`): validate with `blockScoreSchema`, optimistic update, `db.upsertBlockScore`, then log
  the block movements through the existing `logSet` path (AMRAP reps from `amrapMovementTotals`) so the completion
  ring, streaks and the offline queue behave as today. On failure: `reportWriteFailure` and roll back.
- Loading, empty and error states; labels on icon-only buttons; keyboard reachable; palette per AGENTS.md (orange/red
  accent; no new raw hex).

**Tests:** repository against the mock client (scoped by user, upsert conflict key), validation schema cases, timer
helper, and any section/score display helper not already covered in shared.

## Task 3 — Docs (Opus)

`docs/status.md` (what shipped, migration 043 written / applied state, tool count 44), `docs/architecture.md` (new
repo, table, shared module), changelog line in `docs/WEB-ARCHITECTURE-AND-GAME-PLAN.md`, and this file's Status.

## Opus review checklist (per task)
- Diff matches Files and Rules; nothing out of scope; additive only for existing tool outputs.
- Required tests exist; Opus reruns the Definition of Done, not trusting the report.
- No logic in components; DB only through repositories; Zod at every boundary; no secrets.

## After all tasks (needs Matt)
1. PR `feat/coach-notes-blocks` → `main`, CI green.
2. **Matt OK** → apply 043 to production and merge (deploy). Order: migration first, then merge, so the new tool and UI
   never hit a missing table.
3. Backfill Week 38 Saturday: add coach_notes + the `forge` block to the program, then `log_block_score` with Matt's
   real score.
4. Update the Joi skill (`notes` → `note`, blocks) and the morning workout brief prompt to read `coach_notes`/blocks.

## Status

Planned 2026-10-17.

- Task 1 done (Sonnet, `81abe76`, `2d48c09`; Opus fix `043` re-runnable). Opus review: reran DoD (425 tests),
  ran 043 twice on scratch Postgres 17 with RLS/CHECK probes. Extra over plan, accepted: `weight_lbs` kept on
  save (regression test), `bestPreviousScore` in shared, stricter block schema, leader-program lookup.
- Task 2 done (Sonnet, `3329f36`). Opus review: reran DoD (471 tests), checked no DB calls outside repos and
  that block logs bypass the PR wrapper. Extra over plan, accepted: `logSet` `completed` override,
  `useBlockTimer`, `blockScoreEntry`, `ClampedNote`. Not viewed in a browser.
- Task 3 done (Opus): status, architecture, changelog, README/AGENTS tool count.
- Remaining (Matt): PR + CI, apply 043, merge, backfill Week 38, update Joi skill and brief.
