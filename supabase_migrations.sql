-- Nexus Feature Additions — Supabase Migrations
-- Run this in your Supabase SQL Editor

-- Message Reactions
create table if not exists message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id text not null,
  user_id uuid references auth.users(id) on delete cascade,
  emoji text not null,
  created_at timestamptz default now()
);

-- Active Game
create table if not exists active_game (
  user_id uuid references auth.users(id) on delete cascade,
  personality_id text not null,
  game_name text,
  started_at timestamptz default now(),
  primary key(user_id, personality_id)
);

-- Milestones
create table if not exists milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  personality_id text not null,
  level_reached int,
  unlocked_at timestamptz default now()
);

-- Conflict State
create table if not exists conflict_state (
  user_id uuid references auth.users(id) on delete cascade,
  personality_id text not null,
  stage int default 1,
  started_at timestamptz default now(),
  primary key(user_id, personality_id)
);

-- Playlist
create table if not exists playlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  personality_id text not null,
  song_name text not null,
  her_message text,
  added_at timestamptz default now()
);

-- Diary Entries
create table if not exists diary_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  personality_id text not null,
  entry_text text not null,
  created_at timestamptz default now()
);

-- User Settings (per personality)
create table if not exists user_settings (
  user_id uuid references auth.users(id) on delete cascade,
  personality_id text not null,
  theme text default 'dark-rose',
  updated_at timestamptz default now(),
  primary key(user_id, personality_id)
);

-- Add columns to users table
alter table users add column if not exists birthday date;
alter table users add column if not exists first_conversation_date date;
alter table users add column if not exists nickname text;

-- RLS Policies (enable row-level security)
alter table message_reactions enable row level security;
alter table active_game enable row level security;
alter table milestones enable row level security;
alter table conflict_state enable row level security;
alter table playlist enable row level security;
alter table diary_entries enable row level security;
alter table user_settings enable row level security;

-- Allow authenticated users to manage their own data
create policy "Users manage own reactions" on message_reactions for all using (auth.uid() = user_id);
create policy "Users manage own games" on active_game for all using (auth.uid() = user_id);
create policy "Users manage own milestones" on milestones for all using (auth.uid() = user_id);
create policy "Users manage own conflicts" on conflict_state for all using (auth.uid() = user_id);
create policy "Users manage own playlist" on playlist for all using (auth.uid() = user_id);
create policy "Users manage own diary" on diary_entries for all using (auth.uid() = user_id);
create policy "Users manage own settings" on user_settings for all using (auth.uid() = user_id);

-- Create storage bucket for avatars (run separately if needed)
-- insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true);

-- User Communication Profile (adaptive tuning)
create table if not exists user_communication_profile (
  user_id uuid references auth.users(id) on delete cascade,
  personality_id text not null,
  humor_style text,
  engaging_topics text,
  communication_style text,
  emotional_tone text,
  needs text,
  responsiveness text,
  last_analyzed_at int default 0,
  updated_at timestamptz default now(),
  primary key(user_id, personality_id)
);

alter table user_communication_profile enable row level security;
create policy "Users manage own comm profile" on user_communication_profile for all using (auth.uid() = user_id);

-- ── RAG KNOWLEDGE SYSTEM ───────────────────────────────────

-- Enable pgvector extension
create extension if not exists vector;

-- character_knowledge table
create table if not exists character_knowledge (
  id uuid primary key default gen_random_uuid(),
  character_id text not null,
  content text not null,
  embedding vector(1536),
  category text,
  created_at timestamptz default now()
);

-- Index for fast cosine similarity search
create index on character_knowledge 
using ivfflat (embedding vector_cosine_ops)
with (lists = 100);

-- RPC function for retrieving matching knowledge
create or replace function match_knowledge(
  query_embedding vector(1536),
  match_character_id text,
  match_count int default 5
)
returns table(content text, similarity float)
language sql stable
as $$
  select 
    content,
    1 - (embedding <=> query_embedding) as similarity
  from character_knowledge
  where character_id = match_character_id
    and 1 - (embedding <=> query_embedding) > 0.7
  order by embedding <=> query_embedding
  limit match_count;
$$;
