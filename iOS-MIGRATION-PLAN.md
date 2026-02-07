# SwolTracker → iOS App Store: The Master Plan

## Current State Assessment

**What you have:** A functional React + Supabase workout app with AI program generation, buddy groups, real-time chat, 1RM tracking, and an admin panel. ~67 JS/JSX files, ~1,163 lines in `supabase.js`, ~1,047 lines in `swoltracker.jsx`.

**What's solid:** Your Supabase backend is well-designed — normalized schema, RLS policies, RPC functions, proper indexes. This is your biggest asset. The backend doesn't need to change for iOS.

**What's not ready:** The frontend is a React web app with a monolithic state management approach, no type safety, zero tests, and several patterns that won't survive a native migration.

---

## Decision #1: React Native or SwiftUI?

**Recommendation: React Native (Expo)**

Here's why for *your* situation:
- You already have a React codebase — your hooks, business logic, and Supabase integration can transfer nearly 1:1
- Supabase has a first-class JS SDK that works in React Native out of the box
- Your LLM integration layer (`llm.js`) works unchanged
- You can ship to both iOS *and* Android from the same codebase
- Expo handles App Store builds, push notifications, OTA updates without Xcode pain
- You're a small team — maintaining one codebase beats two

SwiftUI would be the right call if you needed heavy native performance (camera, AR, complex animations). A workout tracker doesn't need that.

---

## Decision #2: Feature Audit — Keep, Kill, Improve, Add

### KEEP (core value)
- AI workout generation (this is your differentiator)
- 1RM tracking with history
- Weekly program structure (4-week cycles)
- Set-by-set workout logging with completion tracking
- Equipment management (feeds AI context)
- Onboarding flow (personalization is key)
- Confetti on workout completion (dopamine hit, users love this)

### KILL
- **Demo mode** — Not needed for a native app. App Store review can use a test account. Demo mode adds branching logic everywhere (`if (demoMode)` appears in nearly every handler). Removing it will simplify ~30% of the codebase.
- **Admin panel in-app** — Move admin tooling to a separate web dashboard. Admin features bloat the mobile bundle and are a security surface. API settings, prompt editing, error logs — these belong on a web admin portal, not in the App Store binary.
- **Inline profile switching / "View Buddy" mode** — Confusing UX. Instead, make the buddy system about *seeing their progress*, not literally switching your entire app view to their account.

### IMPROVE

| Feature | Current Problem | Fix |
|---------|----------------|-----|
| **Workout logging** | Toggle-only (tap = complete/uncomplete). No way to edit actual weight/reps mid-set | Add inline weight/rep editing per set. Show prescribed vs actual. |
| **Progress screen** | Shows basic stats (total sets, strength levels) | Add charts — 1RM trends over time, volume per week, body part balance |
| **Group chat** | Fixed 50-message load, no pagination, no media | Add infinite scroll, message reactions, image sharing |
| **Buddy system** | Leader/member hierarchy is rigid | Rename to "Crew" or "Squad". Let anyone share programs bidirectionally |
| **Equipment management** | Flat string list | Categorize (barbells, machines, cables, bodyweight). Auto-suggest from master list |
| **1RM tracking** | Manual entry only | Add a 1RM calculator (weight x reps -> estimated max) |
| **Workout completion** | Binary complete/incomplete | Add RPE (Rate of Perceived Exertion) per set, workout notes |

### ADD (new features for App Store competitiveness)

1. **Rest Timer** — A tappable rest timer between sets. Every serious lifter needs this. Built-in 60/90/120/180s presets with haptic feedback when done.
2. **Push Notifications** — "Time to train!" reminders, buddy request alerts, chat messages, workout streak alerts.
3. **Workout History Calendar** — Visual calendar showing which days you trained. Streak tracking.
4. **Apple Health Integration** — Sync workouts to HealthKit. This is practically required for fitness apps on iOS.
5. **Offline-First Architecture** — Full offline support with background sync. Users train in gyms with bad signal.
6. **Workout Templates** — Let users save and reuse workout templates without AI generation.
7. **Dark/Light Mode** — Currently dark-only. Support system theme preference.
8. **Haptic Feedback** — Tactile feedback on set completion, timer alerts, navigation.
9. **Widget Support** — iOS home screen widget showing today's workout at a glance.
10. **Subscription Model** — Free tier (manual programs) + Pro tier (AI generation, advanced analytics). Required for sustainable revenue.

---

## Phase 1: Pre-Migration Refactoring (Web App Cleanup)

> Do this before writing a single line of React Native. These changes make migration dramatically easier and also improve the web app.

### 1.1 Break Up the Monolith

- [x] `swoltracker.jsx` broken into domain hooks: `useAdmin`, `useAiGenerator`, `useWorkoutLogger`. Reduced from 1,047 to 812 lines. 7 unused hooks deleted.

**Create domain contexts:**
```
src/contexts/
  AuthContext.js        <- auth state + handlers
  WorkoutContext.js     <- program, logging, completions
  ProfileContext.js     <- user profile, maxes, equipment
  GroupContext.js       <- buddy system, group role, members
  ChatContext.js        <- messages, subscriptions, send/read
  AppContext.js         <- UI state (active tab, modals)
```

Each context owns its slice of state, its handlers, and its Supabase calls. `SwolTracker` becomes a thin shell that composes these providers.

### 1.2 Create a Repository Layer

- [x] `db.*` split into 4 domain repositories (`profiles.js`, `workouts.js`, `social.js`, `admin.js`) via factory pattern. `supabase.js` reduced from 1,162 to 57 lines. Zero consumer changes needed.

```
src/repositories/
  AuthRepository.js       <- signIn, signOut, getSession
  ProfileRepository.js    <- getProfile, updateProfile, uploadAvatar
  WorkoutRepository.js    <- programs, logs, completions
  MaxesRepository.js      <- getUserMaxes, updateMax, getHistory
  GroupRepository.js      <- buddies, invites, group management
  ChatRepository.js       <- messages, read status
  AdminRepository.js      <- settings, templates, error logs
  LlmRepository.js        <- AI generation, prompt templates
```

This abstracts Supabase away. When you're in React Native, you swap the implementation (e.g., add offline caching) without touching any component.

### 1.3 Add TypeScript

- [ ] Convert the project to TypeScript. Prioritize:
  1. Database types (generate from Supabase with `supabase gen types typescript`)
  2. Workout program schema (the JSONB blob that AI generates — define this strictly)
  3. Component props
  4. Hook return types

### 1.4 Add Input Validation

- [x] Added Zod validation schemas in `src/lib/validation.js`. Validated: profile updates, max weights (0-9999), lift names (100 chars), chat messages (500 chars), equipment names (100 chars), search queries, AI notes (1000 chars), week counts (1-12).

### 1.5 Fix Security Issues

- [ ] **API keys in database**: The `get_global_llm_api_key` RPC function returns raw API keys to the client. In the native app, route ALL LLM calls through a server-side proxy (you already have `api/claude.js` on Vercel — expand this to be the single gateway).
- [x] **Avatar uploads**: Added MIME type whitelist (jpeg, png, webp, gif), 5MB file size limit.
- [ ] **Profile visibility**: The RLS policy `"Profiles are viewable by everyone"` exposes all user profiles to any authenticated user. Tighten to: viewable by self + group members + users with pending requests.
- [ ] **Admin check**: `isAdmin()` compares against `VITE_ADMIN_EMAIL` client-side. This is bypassable. Move admin authorization to Supabase RLS policies with an `is_admin` column on profiles.
- [ ] **Rate limiting**: Add rate limits on: buddy request sending, chat messages, AI generation, user search. Implement via Supabase Edge Functions or your serverless proxy.

### 1.6 Remove Dead Weight

- [x] Remove demo mode — removed from 12 files (~80 occurrences), deleted demo data constants (230+ lines), simplified auth to Supabase-only
- [x] Extract admin panel — lazy-loaded with `React.lazy` + `Suspense`, code-split into separate 44kB chunk. Admin state moved to `useAdmin` hook.
- [ ] Remove "View Buddy" profile switching

---

## Phase 2: React Native Build

### 2.1 Project Setup

```
npx create-expo-app SwolTracker --template tabs
```

Use Expo Router (file-based routing, similar to Next.js). Stack:
- **Expo SDK 52+**
- **Expo Router** for navigation
- **NativeWind** (Tailwind for React Native — existing class patterns transfer)
- **@supabase/supabase-js** (same client, works in RN)
- **React Native Reanimated** for animations
- **expo-haptics** for tactile feedback
- **expo-notifications** for push
- **@react-native-async-storage/async-storage** for local persistence

### 2.2 Navigation Architecture

```
(tabs)/
  workout.tsx          <- Main workout screen (current day)
  maxes.tsx            <- 1RM tracking
  progress.tsx         <- Stats, charts, calendar
  crew.tsx             <- Groups, chat, social
  _layout.tsx          <- Tab bar configuration

(auth)/
  login.tsx            <- Google/Apple Sign In
  onboarding/
    profile.tsx
    goals.tsx
    schedule.tsx
    equipment.tsx
    generating.tsx     <- AI generation with progress animation
  _layout.tsx

(modals)/
  ai-generator.tsx
  settings.tsx
  rest-timer.tsx
  exercise-detail.tsx
```

### 2.3 Offline-First Data Layer

This is the most important architectural change for native:

```
Local DB (SQLite via expo-sqlite)
    <-> sync engine
Supabase (PostgreSQL)
```

- [ ] All reads come from local SQLite first
- [ ] Writes go to local immediately (optimistic), then sync to Supabase in background
- [ ] Conflict resolution: last-write-wins for simple fields, merge for arrays (like workout logs)
- [ ] Queue unsynced changes when offline, flush on reconnect
- [ ] Use Supabase Realtime for incoming changes from other group members

Consider **WatermelonDB** or **PowerSync** for the sync layer — both are built for exactly this pattern with Supabase.

### 2.4 Authentication

- [ ] **Apple Sign In** — REQUIRED for App Store if you offer any social login
- [ ] **Google Sign In** — Keep this
- [ ] **Supabase Auth** handles both providers
- [ ] Store session tokens in Expo SecureStore (not AsyncStorage)

### 2.5 State Management

Move from scattered `useState` to **Zustand** (lightweight, React Native friendly):

```typescript
// stores/workoutStore.ts
interface WorkoutStore {
  program: Record<number, WeekProgram>;
  currentWeek: number;
  currentDay: DayName;
  exerciseLog: Record<string, SetLog>;
  completedWorkouts: Record<string, boolean>;

  // Actions
  logSet: (params: LogSetParams) => Promise<void>;
  toggleComplete: (week: number, day: string) => Promise<void>;
  loadProgram: (gymId: string) => Promise<void>;
}
```

Zustand stores are framework-agnostic — they'll work if you ever move to SwiftUI with a thin bridge layer.

---

## Phase 3: UX/Design for App Store Quality

### 3.1 Onboarding Redesign

- [ ] Break into 5 swipeable screens with progress dots
- [ ] Add illustrations/animations per step
- [ ] Show a loading animation during AI generation ("Building your custom program...")
- [ ] End with a preview of Week 1 before starting

### 3.2 Workout Screen Redesign

Current: flat list of exercises with toggle buttons.

Target:
```
+-----------------------------+
|  < Week 3 of 4    >        |
|  Mon Tue Wed Thu Fri Sat Sun|
|  *   *   o   @   o   o  o  |  (* = done, @ = today)
+-----------------------------+
|  PUSH DAY                   |
|  ============---  73%       |
+-----------------------------+
|  Bench Press                |
|  1RM: 225 lbs               |
|  +-----+--------+---------+ |
|  | Set | Target | Actual  | |
|  +-----+--------+---------+ |
|  | 1 Y | 185x5  | 185x5   | |
|  | 2 Y | 185x5  | 190x4   | |
|  | 3   | 185x5  | [___x__]| |  <- editable
|  +-----+--------+---------+ |
|         [Rest 2:00]         |  <- starts on set complete
+-----------------------------+
|  Incline DB Press            |
|  ...                        |
+-----------------------------+
```

Key changes:
- [ ] Prescribed vs actual weight/reps shown side by side
- [ ] Inline editing (not just toggle)
- [ ] Auto-starting rest timer
- [ ] Progress bar per workout
- [ ] Visual day completion indicators

### 3.3 Progress Screen Redesign

Current: basic number stats + strength level table.

- [ ] **Line charts** for 1RM progression over time (use `victory-native` or `react-native-chart-kit`)
- [ ] **Calendar heatmap** showing training frequency (GitHub-contribution-style)
- [ ] **Volume tracking** — total weight lifted per week
- [ ] **Streak counter** — "You've trained 3 weeks straight"
- [ ] **Personal records** — celebrate new PRs with animations

### 3.4 Design System

Create a consistent design system before building screens:
```
src/design/
  tokens.ts        <- colors, spacing, typography, radii
  components/
    Button.tsx
    Card.tsx
    Input.tsx
    Badge.tsx
    Avatar.tsx
    Modal.tsx
    ProgressBar.tsx
  theme.ts         <- dark/light theme definitions
```

Current branding (dark zinc + orange accents) works well. Carry it forward but add a light mode option.

---

## Phase 4: App Store Requirements

### 4.1 Mandatory

- [ ] Apple Sign In (required since you offer Google login)
- [ ] Privacy Policy URL
- [ ] Terms of Service URL
- [ ] App Privacy "nutrition labels" (data collection disclosure)
- [ ] App icons (1024x1024 + all device sizes)
- [ ] Launch screen
- [ ] Screenshots for all device sizes (6.7", 6.1", 5.5")
- [ ] App description, keywords, category (Health & Fitness)

### 4.2 Monetization Strategy

**Free Tier:**
- Manual workout creation
- Set logging and completion tracking
- 1RM tracking
- Basic progress stats
- 1 AI program generation per month

**Pro Tier ($7.99/month or $59.99/year):**
- Unlimited AI workout generation
- Advanced analytics (charts, trends, volume tracking)
- Rest timer with custom presets
- Crew features (groups, chat)
- Apple Health sync
- Priority AI models (GPT-4o / Claude Sonnet vs free tier's cheaper models)
- Export data (CSV/PDF)

Use RevenueCat for subscription management — it handles iOS/Android subscriptions, trials, and analytics.

---

## Phase 5: Post-Launch Roadmap

### v1.1 — Social & Engagement
- Workout sharing (share completed workout as image to Instagram/iMessage)
- Weekly summary push notification ("You completed 4/5 workouts this week")
- Leaderboard within Crew groups

### v1.2 — Smart Training
- Auto-progression (AI adjusts weights based on logged performance vs prescribed)
- Deload week detection and suggestion
- Exercise swap suggestions when equipment is unavailable
- Form tips / exercise video links

### v1.3 — Platform
- Apple Watch companion (rest timer, quick logging)
- iPad layout
- Shortcuts/Siri integration ("Hey Siri, what's my workout today?")

---

## Execution Timeline

| Phase | Work | Duration |
|-------|------|----------|
| **Phase 1** | Refactor web app (contexts, repos, TypeScript, validation, security) | 3-4 weeks |
| **Phase 2** | React Native build (navigation, offline sync, core screens) | 5-6 weeks |
| **Phase 3** | UX polish (design system, animations, onboarding, charts) | 2-3 weeks |
| **Phase 4** | App Store prep (subscription, legal, screenshots, testing) | 1-2 weeks |
| **Beta** | TestFlight with real users | 2 weeks |
| **Launch** | App Store submission + review | 1 week |

---

## Top 10 Actions in Priority Order

1. **Kill demo mode** — Remove the branching complexity
2. **Extract admin panel** to a separate web dashboard
3. **Break `swoltracker.jsx`** into domain contexts + Zustand stores
4. **Create repository layer** abstracting Supabase
5. **Add TypeScript** with generated Supabase types
6. **Fix security** — server-side LLM proxy, avatar validation, admin auth
7. **Set up Expo project** with React Native + NativeWind
8. **Build offline-first data layer** with local SQLite + sync
9. **Implement Apple Sign In** + secure token storage
10. **Add rest timer, charts, and haptics** — the features that make it feel native
