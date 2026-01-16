# SwolTracker Architecture & Deployment Guide

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         YOUR PHONE / BROWSER                        │
│                    (React PWA - Add to Home Screen)                 │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                            VERCEL (Free)                            │
│                      https://swoltracker.vercel.app                 │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    React Frontend (Vite)                     │   │
│  │         • Workout Display    • Set Logging                  │   │
│  │         • User Profiles      • 1RM Calculator               │   │
│  │         • AI Generator UI    • Progress Charts              │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                          │                    │
                          ▼                    ▼
┌──────────────────────────────┐    ┌─────────────────────────────────┐
│      SUPABASE (Free)         │    │      CLAUDE API (Pay per use)   │
│  ┌────────────────────────┐  │    │                                 │
│  │   PostgreSQL Database  │  │    │   • Workout Generation          │
│  │   • User Profiles      │  │    │   • ~$0.10-0.50 per request     │
│  │   • Workout Programs   │  │    │   • Called on-demand only       │
│  │   • Workout Logs       │  │    │                                 │
│  │   • 1RM History        │  │    └─────────────────────────────────┘
│  │   • Gym Equipment      │  │
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │   Authentication       │  │
│  │   • Google OAuth       │  │
│  │   • Session Management │  │
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │   Row Level Security   │  │
│  │   • Data isolation     │  │
│  │   • Gym buddy sharing  │  │
│  └────────────────────────┘  │
└──────────────────────────────┘
```

## 📊 Data Flow

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│   Google    │────▶│   Supabase   │────▶│    Frontend     │
│   Login     │     │     Auth     │     │   (logged in)   │
└─────────────┘     └──────────────┘     └─────────────────┘
                                                  │
                    ┌─────────────────────────────┼─────────────────────────────┐
                    ▼                             ▼                             ▼
            ┌──────────────┐             ┌──────────────┐             ┌──────────────┐
            │ Load Profile │             │ Load Workouts│             │  Log a Set   │
            │  & 1RM Data  │             │   for Week   │             │  Completion  │
            └──────────────┘             └──────────────┘             └──────────────┘
                    │                             │                             │
                    ▼                             ▼                             ▼
            ┌──────────────┐             ┌──────────────┐             ┌──────────────┐
            │   Supabase   │             │   Supabase   │             │   Supabase   │
            │   SELECT     │             │   SELECT     │             │   INSERT     │
            └──────────────┘             └──────────────┘             └──────────────┘
```

## 💾 Database Tables Summary

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `profiles` | User info (auto-created on signup) | name, avatar, email |
| `gyms` | Gym buddy groups | name, invite_code |
| `gym_members` | Who belongs to which gym | gym_id, user_id, role |
| `gym_equipment` | Equipment available at gym | gym_id, name |
| `user_maxes` | 1RM history (timestamped) | user_id, exercise, weight, date |
| `workout_programs` | AI-generated or manual programs | gym_id, week_number, program_data (JSON) |
| `workout_logs` | Individual set completions | user_id, week, day, exercise, set, weight, reps |

## 🔒 Security Model

```
┌─────────────────────────────────────────────────────────────────────┐
│                        ROW LEVEL SECURITY                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  YOU (Matt)                         WREN                            │
│  ┌─────────────┐                   ┌─────────────┐                  │
│  │ Your maxes  │◄─── Can see ────▶│ Wren's maxes│                  │
│  │ Your logs   │◄─── each ──────▶│ Wren's logs │                  │
│  │ Your profile│    other's      │ Wren's profile                 │
│  └─────────────┘                   └─────────────┘                  │
│         │                                 │                         │
│         └──────────┬──────────────────────┘                         │
│                    ▼                                                │
│         ┌─────────────────────┐                                     │
│         │   SHARED GYM DATA   │                                     │
│         │  • Workout Programs │                                     │
│         │  • Gym Equipment    │                                     │
│         └─────────────────────┘                                     │
│                                                                     │
│  STRANGER (not in your gym)                                         │
│  ┌─────────────┐                                                    │
│  │ ❌ Cannot   │  Cannot see ANY of your data                      │
│  │    see you  │  (blocked by Row Level Security)                  │
│  └─────────────┘                                                    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## 💰 Cost Breakdown

| Service | Free Tier Limits | Your Usage | Cost |
|---------|-----------------|------------|------|
| **Vercel** | 100GB bandwidth, unlimited deploys | ~1GB/month | **$0** |
| **Supabase** | 500MB database, 50K monthly users | ~50MB, 5-10 users | **$0** |
| **Claude API** | Pay per token | ~10 generations/month | **~$1-5** |
| | | **TOTAL** | **$0-5/month** |

## 🚀 Growth Path

```
NOW (5-10 users)              LATER (50+ users)           SCALE (500+ users)
─────────────────             ────────────────            ─────────────────
Vercel Free ──────────────▶  Vercel Free ───────────▶   Vercel Pro ($20/mo)
Supabase Free ────────────▶  Supabase Free ─────────▶   Supabase Pro ($25/mo)
Claude API ───────────────▶  Claude API ────────────▶   Claude API (volume)
                                                         
$0-5/month                    $0-5/month                 $50-100/month
```

## 🔧 Migration Options (if needed)

Since Supabase uses **standard PostgreSQL**, you can migrate to:

1. **Railway** - Managed Postgres ($5/month)
2. **Neon** - Serverless Postgres (generous free tier)
3. **AWS RDS** - Enterprise scale
4. **Self-hosted** - Your own server

Migration command:
```bash
pg_dump your_supabase_db > backup.sql
psql new_database < backup.sql
```

---

# 🚀 DEPLOYMENT STEPS

## Step 1: Create Supabase Project (5 minutes)

1. Go to [supabase.com](https://supabase.com) and sign up
2. Click "New Project"
3. Name it `swoltracker`
4. Set a database password (SAVE THIS!)
5. Choose region closest to you
6. Wait ~2 minutes for setup

## Step 2: Set Up Database (2 minutes)

1. In Supabase dashboard, go to **SQL Editor**
2. Click "New Query"
3. Copy/paste the entire `swoltracker-schema.sql` file
4. Click "Run" (or Cmd+Enter)
5. Should see "Success. No rows returned"

## Step 3: Enable Google Auth (5 minutes)

1. In Supabase, go to **Authentication** → **Providers**
2. Find **Google** and enable it
3. You'll need Google OAuth credentials:
   - Go to [Google Cloud Console](https://console.cloud.google.com)
   - Create new project "SwolTracker"
   - Go to APIs & Services → Credentials
   - Create OAuth 2.0 Client ID
   - Add authorized redirect: `https://YOUR-PROJECT.supabase.co/auth/v1/callback`
4. Copy Client ID and Secret into Supabase

## Step 4: Get Your Supabase Keys

1. In Supabase, go to **Settings** → **API**
2. Copy these values:
   - `Project URL` (looks like `https://xxxxx.supabase.co`)
   - `anon public` key (long string starting with `eyJ...`)

## Step 5: Create GitHub Repository

```bash
cd ~/Desktop/SwolTracker
git init
git add .
git commit -m "Initial commit"
```

Then create repo on github.com and push:
```bash
git remote add origin https://github.com/mattpmerrill/swoltracker.git
git push -u origin main
```

## Step 6: Deploy to Vercel (3 minutes)

1. Go to [vercel.com](https://vercel.com) and sign up with GitHub
2. Click "New Project"
3. Import your `swoltracker` repository
4. Add Environment Variables:
   - `VITE_SUPABASE_URL` = your project URL
   - `VITE_SUPABASE_ANON_KEY` = your anon key
5. Click "Deploy"
6. Wait ~1 minute
7. Your app is live at `https://swoltracker.vercel.app`!

## Step 7: Add Custom Domain (Optional)

1. In Vercel, go to your project → Settings → Domains
2. Add your domain (e.g., `swoltracker.com`)
3. Update DNS as instructed
4. Free SSL automatically!

---

# ✅ Post-Deployment Checklist

- [ ] Can log in with Google
- [ ] Profile created automatically
- [ ] Can create a gym
- [ ] Can add Wren to gym via invite code
- [ ] Can view/edit 1RM maxes
- [ ] Can view workout programs
- [ ] Can log set completions
- [ ] Can generate AI workouts
- [ ] Data persists after refresh
- [ ] Wren can see shared workout programs

---

# 📱 Mobile Setup

After deploying, on your phone:

1. Open Safari/Chrome
2. Go to your Vercel URL
3. Add to Home Screen
4. Now it works like a native app!
