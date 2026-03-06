# 🌸 Nexus — AI Companion App

A full-stack AI girlfriend web app with Google Sign-In, per-user chat history, multiple personalities, custom personality creation, and an admin dashboard.

---

## Stack
- **Frontend**: React + Vite
- **Backend**: Vercel Serverless Functions (Node.js)
- **Database**: Supabase PostgreSQL
- **Auth**: Supabase Auth (Google Sign-In)
- **AI**: OpenAI GPT-4o mini

---

## Setup & Deploy

### Step 1 — Clone / Upload to GitHub
Upload this entire folder to a new GitHub repo.

### Step 2 — Enable Supabase Project
1. Go to Supabase dashboard → **New Project**
2. In the project, go to **SQL Editor** and run the SQL generation script from `implementation_plan.md` to create tables and RLS policies.
3. Go to **Authentication** → **Providers** → Enable **Google** and configure your OAuth Client ID.

### Step 3 — Connect to Vercel
1. Go to vercel.com → **Add New Project**
2. Import your GitHub repo
3. Framework preset: **Vite**
4. Build command: `npm run build`
5. Output directory: `dist`

### Step 4 — Add Environment Variables in Vercel
In Vercel → Project → Settings → Environment Variables, add:

| Key | Value |
|-----|-------|
| `VITE_SUPABASE_URL` | `https://your-project.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `your-anon-key` |
| `OPENAI_API_KEY` | `sk-your-openai-key` |

Then **redeploy**.

### Step 5 — Add your Vercel URL to Google & Supabase
1. **Google Cloud Console** → APIs & Services → Credentials → your OAuth Client ID
   → Authorized JavaScript Origins → Add: `https://your-app.vercel.app`
   → Authorized Redirect URIs → Add: `https://your-project.supabase.co/auth/v1/callback`

2. **Supabase Console** → Authentication → URL Configuration
   → Site URL: `https://your-app.vercel.app`

### Step 6 — Make yourself Admin
1. Sign in to your app once
2. Go to Supabase Console → Table Editor → `users` table
3. Find your row → edit `role` field → set to `"admin"`
4. Refresh the app → you'll see the Admin dashboard button

---

## Local Development
```bash
npm install
cp .env.example .env.local
# Fill in .env.local with your values
npm run dev
```

---

## Features
- ✅ Google Sign-In via Supabase Auth
- ✅ Chat history saved per user in Supabase PostgreSQL
- ✅ 4 preset personalities (Elena, Nova, Sunny, Raven)
- ✅ Create custom personalities with name, traits, emoji, color
- ✅ Upload chat screenshots — AI analyzes and learns texting style
- ✅ Auto-generated system prompts for custom personalities
- ✅ Dark / Light theme toggle
- ✅ AI initiates conversations on its own
- ✅ Admin dashboard with user management
- ✅ OpenAI key hidden server-side (never exposed to browser)
