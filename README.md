# Nexus — AI Companion App

Nexus is a full-stack AI companion web application that creates deeply personalized conversational experiences. Each AI character has a distinct cultural identity, evolving relationship dynamics, and adaptive personality tuning that learns how you communicate over time.

## How It Works

**Characters** — Four default companions, each with a unique cultural background, native language nuances, emotional range, and texting style. Users can also create custom personalities by uploading chat screenshots for style analysis.

**Relationship Progression** — Conversations evolve naturally through five stages: Stranger → Becoming Friends → Close Friends → Something More → Deeply Connected. Each stage unlocks new behavioral depth, cultural sharing, and emotional intimacy — earned through genuine interaction, not toggled.

**Adaptive Tuning** — Every 15 messages, a background analysis identifies the user's humor style, engaging topics, communication patterns, and emotional needs. This profile is silently injected into the system prompt, so the AI gradually learns how to connect with each individual user.

**Memory & Context** — The AI extracts and remembers facts from conversations, tracks streaks, detects mood, and adjusts tone based on time of day. It recalls what you've told it and references shared history naturally.

## Features

- 🗣️ Voice messages — text-to-speech responses and speech-to-text input
- 🎨 6 chat themes with dynamic styling
- 😊 Message reactions (emoji)
- 🖼️ AI-generated images via DALL-E 3
- 🎮 In-chat mini-games triggered organically
- 💌 AI-initiated heartfelt letters at milestones
- 📔 AI-written diary entries from her perspective
- 🎵 Shared playlist built through conversation
- 📱 PWA support with installable app experience
- ⚙️ Nickname and birthday settings
- 🔐 Admin dashboard with user management

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Vite |
| Backend | Vercel Serverless Functions |
| Database | Supabase PostgreSQL |
| Auth | Supabase Auth (Google Sign-In) |
| AI | OpenAI GPT-4o mini, DALL-E 3 |

## Setup

### 1. Clone & Deploy
```bash
git clone https://github.com/iamrehhh/Nexus.git
```
Import into [Vercel](https://vercel.com) → Framework: **Vite** → Build: `npm run build` → Output: `dist`

### 2. Supabase
Create a project at [supabase.com](https://supabase.com). Run the SQL in `supabase_migrations.sql` via the SQL Editor. Enable Google Auth under Authentication → Providers.

### 3. Environment Variables (Vercel)

| Key | Value |
|-----|-------|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon key |
| `OPENAI_API_KEY` | Your OpenAI API key |

### 4. OAuth Configuration
- **Google Cloud Console** → Add your Vercel URL to Authorized JavaScript Origins and Supabase callback to Redirect URIs
- **Supabase** → Authentication → URL Configuration → Set Site URL to your Vercel URL

### 5. Admin Access
Sign in once, then set your `role` to `"admin"` in the Supabase `users` table.

## Local Development
```bash
npm install
cp .env.example .env.local
# Fill in your keys
npm run dev
```

## License
MIT
