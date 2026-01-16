# SwolTracker Setup Guide

## Quick Start (15 minutes total)

### Prerequisites
- Node.js installed (you have this ✓)
- GitHub account
- Google account (for login testing)

---

## Part 1: Supabase Setup (5 min)

### 1.1 Create Supabase Account
1. Go to [supabase.com](https://supabase.com)
2. Click "Start your project" → Sign up with GitHub
3. Click "New Project"
4. Settings:
   - Name: `swoltracker`
   - Password: (generate & SAVE this!)
   - Region: Choose closest to you
5. Click "Create new project" and wait ~2 min

### 1.2 Create Database Tables
1. In left sidebar, click **SQL Editor**
2. Click **New Query**
3. Copy/paste ENTIRE contents of `swoltracker-schema.sql`
4. Click **Run** (or Cmd+Enter)
5. Should say "Success. No rows returned."

### 1.3 Enable Google Login
1. Go to **Authentication** → **Providers**
2. Find **Google** → Toggle ON
3. Keep this tab open (you'll need it)

### 1.4 Set Up Google OAuth
1. Open new tab → [console.cloud.google.com](https://console.cloud.google.com)
2. Create new project → Name: "SwolTracker"
3. Go to **APIs & Services** → **OAuth consent screen**
   - Choose "External"
   - App name: SwolTracker
   - User support email: (your email)
   - Developer email: (your email)
   - Click Save and Continue (skip scopes)
4. Go to **Credentials** → **Create Credentials** → **OAuth client ID**
   - Application type: Web application
   - Name: SwolTracker Web
   - Authorized redirect URIs: Add this URL from Supabase:
     ```
     https://YOUR-PROJECT-ID.supabase.co/auth/v1/callback
     ```
     (Get this from Supabase → Authentication → URL Configuration)
5. Copy **Client ID** and **Client Secret**
6. Paste into Supabase Google provider settings
7. Click **Save** in Supabase

### 1.5 Get Your API Keys
1. In Supabase: **Settings** → **API**
2. Copy and save:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon public key**: `eyJhbGciOiJIUzI1NiIs...`

---

## Part 2: Local Setup (5 min)

### 2.1 Create Project
```bash
cd ~/Desktop
mkdir SwolTracker
cd SwolTracker
```

### 2.2 Initialize with Vite
```bash
npm create vite@latest . -- --template react
```
(Press `y` if asked about existing directory)

### 2.3 Install Dependencies
```bash
npm install
npm install lucide-react @supabase/supabase-js
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

### 2.4 Configure Tailwind
Open `tailwind.config.js` and replace with:
```js
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

### 2.5 Update CSS
Open `src/index.css` and replace with:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  margin: 0;
  background: #09090b;
}
```

### 2.6 Create Environment File
Create `.env` file in project root:
```
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```
(Use the values from step 1.5)

### 2.7 Add Project Files
1. Create folder: `src/lib/`
2. Copy `supabase.js` to `src/lib/supabase.js`
3. Copy `swoltracker.jsx` to `src/swoltracker.jsx`

### 2.8 Update App.jsx
Open `src/App.jsx` and replace with:
```jsx
import SwolTracker from './swoltracker'

function App() {
  return <SwolTracker />
}

export default App
```

### 2.9 Test Locally
```bash
npm run dev
```
Open http://localhost:5173 in browser

---

## Part 3: Deploy to Vercel (5 min)

### 3.1 Push to GitHub
```bash
git init
echo "node_modules\n.env\ndist" > .gitignore
git add .
git commit -m "Initial SwolTracker commit"
```

Create repo on github.com, then:
```bash
git remote add origin https://github.com/mattpmerrill/swoltracker.git
git branch -M main
git push -u origin main
```

### 3.2 Deploy to Vercel
1. Go to [vercel.com](https://vercel.com) → Sign up with GitHub
2. Click **Add New** → **Project**
3. Import your `swoltracker` repo
4. **Environment Variables** - Add these:
   - `VITE_SUPABASE_URL` = your Supabase URL
   - `VITE_SUPABASE_ANON_KEY` = your Supabase anon key
5. Click **Deploy**
6. Wait ~1 minute

### 3.3 Update Google OAuth Redirect
1. Go back to [Google Cloud Console](https://console.cloud.google.com)
2. **APIs & Services** → **Credentials** → Your OAuth client
3. Add another Authorized redirect URI:
   ```
   https://your-app.vercel.app
   ```
4. Save

---

## 🎉 Done!

Your app is now live at `https://your-app.vercel.app`

### First Time Setup:
1. Open your Vercel URL
2. Click "Sign in with Google"
3. Create your first gym
4. Share the invite code with Wren!

---

## Troubleshooting

### "Invalid redirect URI" on Google login
- Make sure the Supabase callback URL is added to Google Cloud OAuth

### "No rows returned" when running SQL
- This is normal! It means the schema was created successfully

### "Supabase credentials not found"
- Check your `.env` file has correct values
- Make sure env vars are in Vercel project settings

### Can't see workout data
- Make sure you're logged in
- Check you're a member of a gym

---

## Next Steps

1. Add Wren to your gym (share invite code)
2. Enter your 1RM maxes
3. Generate your first AI workout!
