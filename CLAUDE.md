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
├── App.jsx              # Root component, renders SwolTracker
├── main.jsx             # React entry point
├── swoltracker.jsx      # Main app (~3500 lines, contains most UI components)
├── index.css            # Tailwind imports + base styles
├── lib/
│   ├── supabase.js      # Supabase client + all database helpers (db.*)
│   └── llm.js           # Multi-provider LLM calling (OpenAI, Claude, Gemini)
└── components/
    ├── Onboarding.jsx   # New user onboarding flow
    └── admin/
        ├── AdminArea.jsx          # Admin route wrapper
        ├── AdminDashboard.jsx     # Usage stats
        ├── AdminApiSettings.jsx   # API key + provider config
        └── AdminPromptEditor.jsx  # Edit AI prompt templates

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
