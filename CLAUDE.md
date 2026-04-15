# SwolTracker

A workout tracking and AI-powered fitness coaching app built with React and Supabase.

## Overview

SwolTracker helps users track their workouts, log 1RM (one-rep max) lifts, and generate personalized weekly workout programs using AI. It supports both individual use and "workout groups" where members can follow a leader's program.

## Tech Stack

- **Frontend**: React 18 with Vite
- **Styling**: Tailwind CSS 4.0
- **Database/Auth**: Supabase (PostgreSQL + Auth)
- **AI Providers**: OpenAI, Claude (Anthropic), Gemini, OpenRouter (configurable)
- **Icons**: lucide-react
- **Deployment**: Vercel (web), Expo (mobile)
- **Offline-first (mobile)**: PowerSync for React Native

## Project Structure

```
SwolTracker/
├── src/
│   ├── App.jsx                  # Root component — wraps with ToastProvider
│   ├── main.jsx                 # React entry point
│   ├── swoltracker.jsx          # Main app component (~1000 lines) — auth, app state, screen routing, agent chat
│   ├── index.css                # Tailwind imports + base styles
│   ├── lib/
│   │   ├── supabase.js          # Supabase client + composed db object
│   │   ├── llm.js              # Client-side LLM call wrapper (calls /api/llm)
│   │   ├── errorService.js     # Error logging, categories, user-friendly messages
│   │   ├── validation.js       # Zod schemas for form + API validation
│   │   └── repositories/        # Domain-specific database repositories
│   │       ├── profiles.js     # User profile operations
│   │       ├── workouts.js      # Workout programs, maxes, logs (largest repo)
│   │       ├── social.js       # Buddies, groups, group chat
│   │       ├── admin.js        # Admin checks, app settings, prompts, errors
│   │       └── agent-chat.js   # Agent messaging, coach notes, read status
│   ├── components/
│   │   ├── Onboarding.jsx       # New user onboarding flow (13 steps, agent-native)
│   │   ├── Toast.jsx            # Toast notification system (ToastProvider + useToast)
│   │   ├── AgentChat/           # Coach Board — async notes between user and AI agent
│   │   │   ├── AgentChatPanel.jsx    # Slide-up panel with message history + input
│   │   │   ├── CoachNoteCard.jsx     # Compact preview card for workout screen
│   │   │   └── AgentChatFAB.jsx      # Floating action button with unread badge
│   │   ├── admin/               # Admin panel components
│   │   │   ├── AdminArea.jsx            # Route wrapper with tab navigation
│   │   │   ├── AdminDashboard.jsx        # Usage stats
│   │   │   ├── AdminApiSettings.jsx     # API key + LLM provider config
│   │   │   ├── AdminPromptEditor.jsx    # Edit AI prompt templates
│   │   │   └── AdminErrorLogs.jsx       # Error log viewer
│   │   ├── Group/               # Group/buddy UI components
│   │   ├── Layout/              # Header, BottomNav
│   │   ├── Maxes/              # Max tracking: AddLiftModal, MaxCard, QuickReference
│   │   ├── Modals/             # AiGeneratorModal, EquipmentModal, SettingsModal
│   │   ├── Progress/           # ProgressStats, StrengthLevels
│   │   └── Workout/            # WorkoutScreen sub-components: ExerciseCard, SetRow, DaySelector, WeekSelector, WorkoutFocus, RestTimer
│   ├── screens/                 # Top-level screen components
│   │   ├── WorkoutScreen.jsx   # Main workout view
│   │   ├── MaxesScreen.jsx     # 1RM tracking view
│   │   ├── ProgressScreen.jsx  # Progress/charts view
│   │   └── BuddiesScreen.jsx  # Buddies + groups view
│   ├── hooks/                   # Custom React hooks
│   │   ├── useAdmin.js         # Admin state + check
│   │   ├── useAiGenerator.js   # AI workout generation state + logic
│   │   ├── useWorkoutLogger.js # Set logging logic
│   │   └── useExerciseSwap.js  # Exercise swap request flow
│   ├── constants/               # App constants (equipment list, etc.)
│   └── utils/
│       ├── date.js             # Week/date calculations
│       ├── workout.js          # Workout math helpers
│       └── storage.js          # LocalStorage helpers

├── api/                         # Vercel serverless functions
│   ├── llm.js                  # LLM proxy — calls OpenAI/Claude/Gemini/OpenRouter server-side
│   └── mcp.js                  # MCP (Model Context Protocol) endpoint for external AI agents

├── mcp/                         # MCP server source (TypeScript)
│   ├── src/tools/
│   │   ├── queries.ts          # Read-only data access (30+ tools)
│   │   ├── actions.ts          # Write operations (log sets, save programs)
│   │   ├── context.ts          # Compressed state bundles
│   │   ├── generation.ts       # AI program generation & saving
│   │   ├── coaching.ts         # Coach Board messaging (send/read notes)
│   │   └── natural-language.ts # NL exercise logging with fuzzy matching
│   ├── src/register-tools.ts   # Tool registration with schemas
│   └── dist/                   # Compiled MCP tools

├── migrations/                 # SQL migrations (numbered: 001–024 + named)
│   └── supabase/              # Supabase local dev config

├── mobile/                      # React Native/Expo mobile app
│   ├── app/                   # Expo Router screens
│   ├── components/            # Native components
│   ├── lib/                   # Mobile-specific lib (PowerSync, Supabase)
│   ├── stores/               # React Native state stores
│   └── contexts/             # React contexts

├── files/                      # File storage (avatars)
└── public/                    # Static assets
```

## Key Patterns

### Database Access
All database operations go through the composed `db` object from `src/lib/supabase.js`:
```javascript
import { db } from './lib/supabase';
await db.getProfile(userId);
await db.getUserMaxes(userId);
await db.saveWorkoutProgram(gymId, weekNumber, programData, userId, aiGenerated, aiNotes);
await db.getBuddyRequests(userId);
await db.getLlmProvider();         // returns: 'openai' | 'claude' | 'gemini' | 'openrouter'
```

Domain repositories (`src/lib/repositories/`):
- `profiles.js` — profile CRUD, onboarding
- `workouts.js` — maxes, programs, workout logs, overload recommendations
- `social.js` — buddies, gym groups, group chat
- `admin.js` — admin RPC, app settings, prompt templates, error logging
- `agent-chat.js` — agent messages, coach notes, read status, API key detection

### State Management
- React useState hooks (no external state library)
- Main auth + app state lives in `swoltracker.jsx`
- Screen-specific state in each screen component
- Custom hooks for complex state: `useAiGenerator`, `useWorkoutLogger`, `useExerciseSwap`, `useAdmin`

### Component Organization
- Screen-level components in `src/screens/`
- Shared UI components in `src/components/`
- `swoltracker.jsx` handles auth + app-level state + screen routing + agent chat realtime

### Styling
- Tailwind utility classes throughout
- Dark theme with zinc color palette
- Orange/red accent colors for branding
- Common patterns:
  - `bg-zinc-900`, `bg-zinc-800` for cards
  - `text-orange-500` for accents
  - `rounded-xl`, `rounded-2xl`, `rounded-3xl` for border radius
  - Cyan/teal (`text-cyan-400`, `from-cyan-500 to-teal-600`) for AI agent features

## Features

1. **User Authentication** - Google OAuth via Supabase
2. **1RM Tracking** - Log and track personal records for lifts
3. **Weekly Programs** - 4-week workout cycles with percentage-based weights
4. **AI Workout Generation** - Generate personalized workouts based on user profile (OpenAI, Claude, Gemini, or OpenRouter)
5. **Workout Groups** - Leaders create programs, members follow
6. **Buddy System** - Send/accept buddy requests
7. **Onboarding Flow** - 13-step wizard collecting user info + optional AI agent connection
8. **Admin Panel** - Manage API keys, prompt templates, view stats, error logs
9. **MCP Server** — External AI agents can interact with SwolTracker via Model Context Protocol (30+ tools)
10. **AI Agent-Native Onboarding** — Users can connect their AI agent (OpenClaw, Hermes, etc.) during signup via MCP API key generation. Agent can generate workout programs during onboarding with live progress polling.
11. **Coach Board** — Async messaging between user and their AI agent. Agents post weekly reviews and program updates via `send_coach_message` MCP tool. Users can leave notes for their agent. Coach note card appears on workout screen.
12. **Weekly Agent Reviews** — Agents run weekly crons to analyze training data (`get_training_history_summary`, `get_overload_recommendations`, `generate_weekly_summary`) and post coaching notes with formatted markdown rendering.

## Environment Variables

Required in `.env`:
```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_ADMIN_EMAIL=admin@example.com  # Email for admin access
```

Server-side (Vercel env vars for `api/llm.js`):
```
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=AIza...
OPENROUTER_API_KEY=sk-or-...
```

## Running Locally

```bash
npm install
npm run dev
```

## Database Schema

Key tables (see `swoltracker-schema.sql` for full schema):
- `profiles` - User profiles (extends Supabase auth.users), includes onboarding fields
- `gyms` - Workout groups
- `gym_members` - Many-to-many gym membership
- `gym_equipment` - Equipment per gym (populated during onboarding)
- `user_maxes` - 1RM records
- `workout_programs` - Weekly workout programs (JSONB)
- `workout_logs` - Individual set logs
- `workout_completions` - Whole workout marked complete
- `buddy_requests` - Buddy/group relationships
- `group_messages` - Group chat messages (migrations/013)
- `error_logs` - Application error tracking (migrations/009)
- `app_settings` - Key-value store for LLM provider config and API keys
- `api_usage_logs` - Token usage tracking
- `api_keys` - MCP API keys for external agents (migrations/021). SHA-256 hashed, `swol_` prefix, max 5 per user
- `agent_messages` - Coach Board messages between user and agent (migrations/024). Fields: role (user/agent), message_type (chat/weekly_review/program_update/milestone), content (max 5000), week_number, metadata (JSONB)
- `agent_read_status` - Tracks when user last read agent messages (migrations/024)
- `app_events` - Bot-native event stream for PRs, completions (migrations/020)

## AI Integration

The app supports multiple LLM providers via the serverless proxy at `/api/llm` (API keys never leave the server):

| Provider | Onboarding Model | Weekly Program Model |
|----------|-----------------|---------------------|
| OpenAI | `gpt-4o-mini` | `gpt-4o` |
| Claude | `claude-3-haiku-20240307` | `claude-3-5-sonnet-latest` |
| Gemini | `gemini-1.5-flash` | `gemini-1.5-pro` |
| OpenRouter | `openrouter/auto` | `openrouter/auto` |

The active provider is stored in `app_settings` (key: `llm_provider`) and can be changed in **Admin → API Settings**. API keys for each provider are stored in `app_settings` with keys like `llm_api_key_openai`, `llm_api_key_claude`, etc.

Prompt templates are stored in the `prompt_templates` table and are editable via the admin panel (**Admin → Prompt Templates**).

### Client-side LLM call (src/lib/llm.js)
```javascript
import { generateWithLlm } from './lib/llm';
const result = await generateWithLlm(provider, systemPrompt, userPrompt, 'weekly', db, currentUser);
```

## AI Agent-Native Architecture

SwolTracker is designed to be **AI agent-native** — users can connect their own AI agents (OpenClaw, Hermes, Claude Desktop, etc.) during onboarding to interact with the app via MCP.

### Onboarding Agent Flow
1. Step 2 of onboarding ("Connect Your Agent") generates an MCP API key via `create_api_key` RPC
2. User copies the API key + MCP config JSON to their agent
3. User completes remaining profile steps (name, gender, age, goals, etc.)
4. At the generating step, agent-connected users see a copyable context block + live polling for workout programs
5. As the agent saves programs via `generate_workout_program` MCP tool, week-progress dots fill in real-time
6. Fallback: "Generate for me instead" uses SwolTracker's built-in LLM proxy

### MCP Server (`api/mcp.js`)
- **Auth**: `Authorization: Bearer swol_<key>` — SHA-256 hashed lookup in `api_keys` table
- **Rate limit**: 500 requests/hour per user
- **Stateless**: Each request creates an isolated MCP server with user-scoped tools
- **Service role**: Uses `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS for agent writes)
- **Build**: `cd mcp && npm run build` compiles TypeScript to `mcp/dist/`

### MCP Tools (33+ tools across 6 modules)

| Module | Tools | Purpose |
|--------|-------|---------|
| `queries.ts` | `get_profile`, `get_todays_workout`, `get_weekly_workout`, `get_training_history_summary`, `get_overload_recommendations`, `get_streak`, etc. | Read-only data access |
| `actions.ts` | `log_set`, `save_workout_program`, `mark_workout_complete`, `update_max`, `generate_weekly_summary`, etc. | Write operations |
| `context.ts` | `get_context_bundle`, `get_streak` | Compressed state (<500 tokens) |
| `generation.ts` | `get_prompt_template`, `generate_workout_program` | Multi-week program saving |
| `coaching.ts` | `send_coach_message`, `get_user_messages`, `get_conversation_history` | Coach Board messaging |
| `natural-language.ts` | `log_exercise`, `log_workout_summary` | NL parsing with fuzzy matching |

### Coach Board
Async messaging between user and their AI agent, displayed in a slide-up panel (AgentChatPanel) accessible via floating action button (AgentChatFAB). Coach note preview card (CoachNoteCard) shows on the workout screen.

**Message types:**
- `chat` — general notes between user and agent
- `weekly_review` — agent's weekly training analysis (rendered as green-accented card)
- `program_update` — agent's workout program changes (rendered as orange-accented card with optional change metadata)
- `milestone` — achievement celebrations

**Agent weekly review cron workflow** (prompted via Settings → "Set Up Weekly Reviews"):
1. Agent calls `get_training_history_summary` for workout data
2. Agent calls `get_overload_recommendations` for lift progression
3. Agent calls `generate_weekly_summary` for completion stats
4. Agent calls `get_streak` for consistency
5. Agent sends analysis via `send_coach_message` (type: `weekly_review`)
6. If program adjustments needed: `save_workout_program` + `send_coach_message` (type: `program_update`)

**Content rendering:** Messages support literal `\n` → line breaks and `**bold**` → bold text via the `FormattedText` component in `AgentChatPanel.jsx`.

**Database helpers:**
```javascript
await db.getAgentMessages(userId, limit, beforeId);
await db.sendUserMessage(userId, content);       // role='user'
await db.deleteAgentMessage(userId, messageId);   // user messages only
await db.hasUnreadAgentMessages(userId);           // boolean
await db.markAgentMessagesRead(userId);
await db.getLatestCoachNote(userId);               // most recent weekly_review/program_update
await db.hasAgentKey(userId);                      // boolean — has active API key
```

**Realtime:** `agent_messages` table is added to `supabase_realtime` publication. `swoltracker.jsx` subscribes to INSERT events filtered by user_id for live updates.

## Current Week Calculation

The app calculates the current week based on `program_start_date` in the user's profile:
```javascript
const weeksSinceStart = Math.floor((today - startDate) / (7 * 24 * 60 * 60 * 1000));
const currentWeek = (weeksSinceStart % 4) + 1;  // Cycles through weeks 1-4
```

## Error Handling Framework

The app has a centralized error handling system for logging, user notifications, and admin visibility.

### Key Files
- `src/lib/errorService.js` - Error utilities, categories, user-friendly messages
- `src/components/Toast.jsx` - Toast notification system (ToastProvider + useToast hook)
- `src/components/admin/AdminErrorLogs.jsx` - Admin panel for viewing/resolving errors
- `migrations/009-error-logging.sql` - Database schema for error_logs table

### Error Categories
Use these categories when logging errors:
```javascript
import { ErrorCategory, ErrorSeverity } from './lib/errorService';

// Categories: llm, database, parsing, avatar, auth, network, unknown
// Severities: warning, error, critical
```

### Logging Errors
```javascript
import { logError, ErrorCategory, ErrorSeverity } from './lib/errorService';

await logError(db, {
  category: ErrorCategory.LLM,        // or DATABASE, PARSING, AVATAR, NETWORK, AUTH
  message: 'Human-readable error description',
  severity: ErrorSeverity.ERROR,        // or WARNING, CRITICAL
  userId: currentUser,                // optional
  component: 'swoltracker.jsx',        // file where error occurred
  operation: 'generateAiWorkout',     // function/operation name
  originalError: error,               // the caught error object
  context: { /* additional data */ }  // optional metadata
});
```

### Toast Notifications
Show user-friendly notifications:
```javascript
import { useToast } from './components/Toast';

const toast = useToast();
toast.success('Workout saved!');
toast.error('Failed to generate workout. Please try again.');
toast.warning('You are offline');
toast.info('New feature available');
```

### LLM Error Handling
The LLM service (`src/lib/llm.js`) has built-in:
- **65-second timeout** - Prevents hanging requests
- **Retry logic** - 2 retries with exponential backoff
- **Automatic error logging** - Pass `db` and `userId` to enable
- **User-friendly messages** - Errors are translated to helpful messages

```javascript
// Pass db and userId to enable automatic error logging
const result = await generateWithLlm(provider, systemPrompt, userPrompt, 'weekly', db, currentUser);
```

### Admin Error Viewer
Admins can view errors at **Admin → Error Logs**:
- Filter by category, severity, resolved status
- View stack traces and context
- Mark errors as resolved
- Cleanup old resolved errors (30+ days)

### Database Helpers
```javascript
await db.logError(category, message, severity, userId, component, operation, stackTrace, context);
await db.getErrorLogs({ limit, offset, category, severity, resolved });
await db.getErrorStats();
await db.resolveError(errorId, notes);
await db.cleanupOldErrors();
```

### When to Log Errors
- LLM API failures (automatic if db/userId passed)
- JSON parsing failures from AI responses
- Database operation failures (critical operations)
- File upload failures (avatars)
- Authentication/session issues

Keep error handling focused on the top failure points — don't over-engineer by adding try/catch everywhere.
