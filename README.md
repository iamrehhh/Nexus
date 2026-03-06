# 🌸 Nexus — AI Companion App

A full-stack AI girlfriend web app with Google Sign-In, per-user chat history, multiple personalities, custom personality creation, and an admin dashboard.

---

## Stack
- **Frontend**: React + Vite
- **Backend**: Vercel Serverless Functions (Node.js)
- **Database**: Firebase Firestore
- **Auth**: Firebase Auth (Google Sign-In)
- **AI**: OpenAI GPT-4o mini

---

## Setup & Deploy

### Step 1 — Clone / Upload to GitHub
Upload this entire folder to a new GitHub repo.

### Step 2 — Enable Firestore in Firebase
1. Go to Firebase Console → your project
2. Click **Firestore Database** → **Create database**
3. Start in **production mode**
4. Choose a region → Done

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
| `VITE_FIREBASE_API_KEY` | `AIzaSyDiCnmLCQI8LB149FJNits47acSp_Z6NGI` |
| `VITE_FIREBASE_AUTH_DOMAIN` | `ai-gf-8baa6.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | `ai-gf-8baa6` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `ai-gf-8baa6.firebasestorage.app` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `221698899209` |
| `VITE_FIREBASE_APP_ID` | `1:221698899209:web:2318c2095d78a26ddc27d8` |
| `OPENAI_API_KEY` | `sk-your-openai-key` |

Then **redeploy**.

### Step 5 — Add your Vercel URL to Google & Firebase
1. **Google Cloud Console** → APIs & Services → Credentials → your OAuth Client ID
   → Authorized JavaScript Origins → Add: `https://your-app.vercel.app`

2. **Firebase Console** → Authentication → Settings → Authorized domains
   → Add: `your-app.vercel.app`

### Step 6 — Make yourself Admin
1. Sign in to your app once
2. Go to Firebase Console → Firestore → `users` collection
3. Find your document → edit `role` field → set to `"admin"`
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
- ✅ Google Sign-In via Firebase Auth
- ✅ Chat history saved per user in Firestore
- ✅ 4 preset personalities (Elena, Nova, Sunny, Raven)
- ✅ Create custom personalities with name, traits, emoji, color
- ✅ Upload chat screenshots — AI analyzes and learns texting style
- ✅ Auto-generated system prompts for custom personalities
- ✅ Dark / Light theme toggle
- ✅ AI initiates conversations on its own
- ✅ Admin dashboard with user management
- ✅ OpenAI key hidden server-side (never exposed to browser)
