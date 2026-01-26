# SwolTracker

A workout tracking and AI-powered fitness coaching app built with React and Supabase.

## Overview

SwolTracker helps users track their workouts, log 1RM (one-rep max) lifts, and generate personalized weekly workout programs using AI. It supports both individual use and "workout groups" where members can follow a leader's program.

## Tech Stack

- **Frontend**: React 18 with Vite
- **Styling**: Tailwind CSS 4.0
- **Database/Auth**: Supabase (PostgreSQL + Auth)
- **AI Providers**: OpenAI, Claude (Anthropic), Gemini (configurable)
- **Icons**: lucide-react
- **Deployment**: Vercel

## Project Structure

```
src/
├── App.jsx              # Root component, wraps with ToastProvider
├── main.jsx             # React entry point
├── swoltracker.jsx      # Main app (~3500 lines, contains most UI components)
├── index.css            # Tailwind imports + base styles
├── lib/
│   ├── supabase.js      # Supabase client + all database helpers (db.*)
│   ├── llm.js           # Multi-provider LLM calling with timeout/retry
│   └── errorService.js  # Error handling utilities + user-friendly messages
└── components/
    ├── Onboarding.jsx   # New user onboarding flow
    ├── Toast.jsx        # Toast notification system (ToastProvider + useToast)
    └── admin/
        ├── AdminArea.jsx          # Admin route wrapper with tabs
        ├── AdminDashboard.jsx     # Usage stats
        ├── AdminApiSettings.jsx   # API key + provider config
        ├── AdminPromptEditor.jsx  # Edit AI prompt templates
        └── AdminErrorLogs.jsx     # Error log viewer for admins

migrations/              # SQL migrations for Supabase
supabase/               # Supabase local dev config
```

## Key Patterns

### Database Access
All database operations go through `db.*` helpers in `src/lib/supabase.js`:
```javascript
import { db } from './lib/supabase';
await db.getProfile(userId);
await db.getUserMaxes(userId);
await db.saveWorkoutProgram(gymId, weekNumber, programData, userId, aiGenerated, aiNotes);
```

### State Management
- Uses React useState hooks (no external state library)
- Main state lives in the SwolTracker component
- Demo mode available for testing without auth

### Component Organization
- Most UI components are defined inline in `swoltracker.jsx`
- Components are separated by comment blocks: `// ============================================`
- Major components: LoginPage, ProfileSwitcher, BuddiesModal, EquipmentModal, WorkoutDay, MaxesView, etc.

### Styling
- Tailwind utility classes throughout
- Dark theme with zinc color palette
- Orange/red accent colors for branding
- Common patterns:
  - `bg-zinc-900`, `bg-zinc-800` for cards
  - `text-orange-500` for accents
  - `rounded-xl`, `rounded-2xl`, `rounded-3xl` for border radius

## Features

1. **User Authentication** - Google OAuth via Supabase
2. **1RM Tracking** - Log and track personal records for lifts
3. **Weekly Programs** - 4-week workout cycles with percentage-based weights
4. **AI Workout Generation** - Generate personalized workouts based on user profile
5. **Workout Groups** - Leaders create programs, members follow
6. **Buddy System** - Send/accept buddy requests
7. **Onboarding Flow** - Collects user info for AI workout generation
8. **Admin Panel** - Manage API keys, prompt templates, view stats

## Environment Variables

Required in `.env`:
```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_ADMIN_EMAIL=admin@example.com  # Email for admin access
```

## Running Locally

```bash
npm install
npm run dev
```

## Database Schema

Key tables (see `swoltracker-schema.sql` for full schema):
- `profiles` - User profiles (extends Supabase auth.users)
- `gyms` - Workout groups
- `gym_members` - Many-to-many gym membership
- `user_maxes` - 1RM records
- `workout_programs` - Weekly workout programs (JSON)
- `workout_logs` - Individual set logs
- `buddy_requests` - Buddy/group relationships
- `error_logs` - Application error tracking (see migrations/009-error-logging.sql)

## AI Integration

The app supports multiple LLM providers (`src/lib/llm.js`):
- **OpenAI**: gpt-4o-mini (onboarding), gpt-4o (weekly programs)
- **Claude**: claude-3-haiku (onboarding), claude-3-5-sonnet (weekly)
- **Gemini**: gemini-1.5-flash (onboarding), gemini-1.5-pro (weekly)

Prompt templates are stored in the database and editable via admin panel.

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
  severity: ErrorSeverity.ERROR,      // or WARNING, CRITICAL
  userId: currentUser,                // optional
  component: 'swoltracker.jsx',       // file where error occurred
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
- **60-second timeout** - Prevents hanging requests
- **Retry logic** - 2 retries with exponential backoff
- **Automatic error logging** - Pass `db` and `userId` to enable
- **User-friendly messages** - Errors are translated to helpful messages

```javascript
// Pass db and userId to enable automatic error logging
const result = await callLlmProvider(provider, apiKey, systemPrompt, userPrompt, 'weekly', db, currentUser);
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

Keep error handling focused on the top failure points - don't over-engineer by adding try/catch everywhere.
