# SwolTracker — Next Level Roadmap

> Written: 2026-03-11  
> Author: Joi (Product Design & AI Strategy)  
> Status: Approved — implementation starts next sprint

---

## Product Direction: Agent-Native First

SwolTracker is making a deliberate bet on **agent-native design** — where an AI agent (connected via MCP) is the primary intelligence layer, and the app is the data store + visualization surface.

This is the right call because:
- The MCP server infrastructure is already live (30 tools)
- Nobody else is building gym software this way
- It makes the product genuinely smarter, not just gimmick-smart
- Users who want a traditional experience still get one — the agent just makes it dramatically better

**The shift in mental model:**
> Old: "App with an AI button"  
> New: "AI-first gym OS where the app shows you what the agent knows"

---

## Phase 1 — Program Intelligence (Highest Impact)

### 1A. Adaptive Program Generation

**The problem:** Programs are generated week-by-week in isolation. If you miss Wednesday, the program just sits there. If you've been at 235 lbs for 3 weeks, nothing tells you to bump it.

**What we build:**
- Program generation prompt gets the last 4 weeks of actual log data injected — not just maxes
- When generating Week N, the AI sees: which days were completed, which were missed, actual weights lifted vs prescribed, any PRs set
- Output: a program that actually responds to what you did, not just a generic template

**New MCP tool needed:** `get_training_history_summary(weeks: number)` — returns a compact training block summary optimized for injection into program gen prompts

**Frontend change:** "Generate Next Week" button becomes "Review + Generate" — shows you what the AI knows about your recent training before you accept the new week

**Effort:** ~1 day (MCP tool) + ~0.5 day (prompt update) + ~1 day (UI)

---

### 1B. Progressive Overload Alerts

**The problem:** The data for progressive overload decisions is all there, but nothing surfaces it.

**What we build:**
- New MCP tool: `get_overload_recommendations()` — scans recent logs and returns exercises where the user has:
  - Hit prescribed reps at prescribed weight 3+ sessions in a row → recommend +5 lbs
  - Consistently failed to hit prescribed reps → recommend deload or form check
  - Not logged in 2+ weeks → flag as stale

- Agent proactively surfaces these during workout context reads
- Frontend: small "ready to level up" badge on exercise cards where a progression rec exists

**Effort:** ~1.5 days (MCP tool + logic) + ~0.5 day (frontend badge)

---

### 1C. Missed Day Handling

**The problem:** Life happens. No mechanism to reschedule or acknowledge a missed day.

**What we build:**
- New MCP tool: `log_missed_day(day_name, reason?: string)` — marks a day as intentionally skipped (injury, travel, life) vs unlogged
- Program gen takes missed day reasons into account — if you were sick, it doesn't increase volume next week
- Frontend: "Mark as skipped" option alongside "Mark complete" on each day

**Effort:** ~0.5 day (MCP) + ~0.5 day (frontend)

---

## Phase 2 — Social & Accountability Layer

### 2A. Gym Activity Feed

**The problem:** The gym member data model is there, but members train in complete isolation from each other.

**What we build:**
- New table: `gym_activity_feed` — events like `workout_completed`, `pr_set`, `streak_milestone` are visible to gym members
- Frontend: Simple activity feed on the gym home screen — "Matt completed Monday's push session" / "Wren hit a new bench PR: 215 lbs 🔥"
- Privacy control: opt-in per user (default: share with gym members only)

**Effort:** ~1 day (schema + feed query) + ~1.5 days (frontend feed component)

---

### 2B. Friendly Competition

**What we build:**
- Weekly gym leaderboard: most sets completed, most volume moved, most days complete
- End-of-week `gym_weekly_recap` event — auto-generated, surfaced by agent
- Agent can read gym standings and trash-talk appropriately 😂

**Effort:** ~1 day (leaderboard query + event) + ~1 day (frontend)

---

### 2C. Shared Programs

**What we build:**
- Gym owner can push a program to all gym members at once
- Members can opt to use the shared program or run their own
- "Train Together" mode: all members on the same week's program, can see each other's logged progress on shared exercises

**Effort:** ~1.5 days (backend) + ~1 day (frontend)

---

## Phase 3 — Body Metrics & Recovery

### 3A. Body Metrics Tracking

**The problem:** SwolTracker tracks what you lift but not how your body is changing.

**What we build:**
- New table: `body_metrics` — weight (lbs), body fat % (optional), measurements (optional)
- New MCP tools: `log_body_metric(type, value, date?)` and `get_body_metrics_history(type, weeks?)`
- Frontend: simple weight trend chart alongside workout volume trend
- Agent: can correlate body weight changes with training volume

**Effort:** ~0.5 day (schema) + ~1 day (MCP tools) + ~1.5 days (frontend chart)

---

### 3B. Recovery / Readiness Self-Report

**What we build:**
- Before or after each workout, optional 1-tap readiness rating (1–5: crushed / good / okay / tired / destroyed)
- New MCP tool: `log_readiness(score: 1-5, notes?: string)`
- Program gen uses readiness trends — if you've been rating 2s all week, next week's volume auto-adjusts
- Agent asks about readiness during morning check-ins on workout days

**Effort:** ~0.5 day (schema + MCP tool) + ~1 day (frontend quick-tap UI)

---

### 3C. Apple Health Sync (iOS)

**What we build (coordinated with iOS migration):**
- Pull sleep hours, resting heart rate, HRV from HealthKit
- Feed into readiness score automatically — no manual entry needed
- Program gen prompt includes weekly avg sleep and HRV when available

**Effort:** ~2 days (HealthKit integration in iOS app) — dependent on iOS migration

---

## Phase 4 — Notifications & Engagement

### 4A. Native Push Notifications

**The problem:** The `check_workout_reminder` MCP tool works great for agent-connected users. For everyone else, nothing.

**What we build:**
- Supabase Edge Function polls for workout reminders + streak alerts on a cron schedule
- Sends push via Expo Push Notifications (iOS/Android) or Web Push (PWA)
- Notification types: workout reminder, streak at risk, PR milestone, weekly summary ready, gym activity (friend got a PR)

**Effort:** ~1.5 days (Edge Function + push setup) + ~0.5 day (frontend permission flow)

---

### 4B. Agent Morning Check-In (Agent-Native)

**What we build:**
- On heartbeat, agent checks if today is a workout day
- If yes + it's morning (8–9 AM): proactively sends a workout brief — today's focus, key exercises, any progression recs
- This replaces the need for any push notification for agent-connected users

**Effort:** ~0.5 day (heartbeat logic update, already partially there with `check_workout_reminder`)

---

## Phase 5 — UI Polish & Power User Features

### 5A. Workout History Timeline

A visual timeline of all completed workouts — scrollable, filterable by exercise, shows volume and PR markers over time. The data is all there — just needs a compelling visualization layer.

### 5B. Exercise Detail Pages

Tap any exercise → see your full history for that lift: weight progression chart, best sets, program progression across weeks. Currently this data is all in `get_program_progression` and `get_max_history` but there's no UI for it.

### 5C. Program Export / Sharing

Export any week's program as a PDF or shareable link. Send your program to a friend who isn't on SwolTracker yet. Great growth mechanic.

### 5D. Dark Mode / Theming

It's a gym app. Dark mode should be default.

---

## Implementation Priority

| Phase | Feature | Effort | Impact | When |
|-------|---------|--------|--------|------|
| 1A | Adaptive program gen | 2.5d | 🔥🔥🔥 | Sprint 1 |
| 1B | Progressive overload alerts | 2d | 🔥🔥🔥 | Sprint 1 |
| 1C | Missed day handling | 1d | 🔥🔥 | Sprint 1 |
| 2A | Gym activity feed | 2.5d | 🔥🔥🔥 | Sprint 2 |
| 4A | Native push notifications | 2d | 🔥🔥🔥 | Sprint 2 |
| 3A | Body metrics | 3d | 🔥🔥 | Sprint 2 |
| 3B | Recovery self-report | 1.5d | 🔥🔥 | Sprint 2 |
| 2B | Friendly competition | 2d | 🔥🔥 | Sprint 3 |
| 2C | Shared programs | 2.5d | 🔥🔥 | Sprint 3 |
| 5A | Workout history timeline | 2d | 🔥 | Sprint 3 |
| 5B | Exercise detail pages | 1.5d | 🔥 | Sprint 3 |
| 3C | Apple Health sync | 2d | 🔥🔥 | iOS sprint |
| 4B | Agent morning check-in | 0.5d | 🔥🔥 | Anytime |
| 5C | Program export/share | 1d | 🔥 | Sprint 4 |
| 5D | Dark mode | 1d | 🔥 | Sprint 4 |

**Total estimated effort: ~31 days of development across 4 sprints**

---

## Agent-Native Design Principles

These should guide every decision from here:

1. **Agent first, UI second.** Every new feature should have an MCP tool before it has a UI. If an agent can't interact with it, it's not done.

2. **The UI shows what the agent knows.** Progress badges, overload recs, readiness alerts — these shouldn't be computed in the frontend. They should be data the agent wrote, displayed by the UI.

3. **Conversation is a valid UX pattern.** "Generate me a new program" spoken to the agent is as valid as clicking a button. Design for both.

4. **Keep the "Generate" button as a fallback.** Don't remove it. Users without agents need it. But don't make it the primary story.

5. **Events are the integration layer.** Everything interesting that happens in SwolTracker should emit an event. Agents, notifications, feeds — all consume events. Keep building on the `app_events` pattern.

---

## Current State (as of 2026-03-11)

- ✅ 30 MCP tools live
- ✅ Program generation (weekly, AI-driven)
- ✅ Full logging system (set-level, bulk, correction, deletion)
- ✅ Exercise name normalization
- ✅ Streak tracking
- ✅ Workout reminders (agent-connected users)
- ✅ Weekly summaries
- ✅ Week comparison
- ✅ Enriched context bundle
- ✅ Multi-gym support
- ✅ Database fully clean (audit complete 2026-03-11)
- 🔜 Everything above

---

*SwolTracker isn't a gym app. It's the first gym OS built for the AI agent era.*
