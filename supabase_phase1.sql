-- ============================================================
-- NEXUS PHASE 1 — SUPABASE MIGRATION
-- Run this entire script in the Supabase SQL Editor
-- WARNING: This drops ALL existing tables
-- ============================================================

-- Drop all old girlfriend app tables
drop table if exists character_knowledge cascade;
drop table if exists user_memory cascade;
drop table if exists user_profiles cascade;
drop table if exists user_profile cascade;
drop table if exists engagement_state cascade;
drop table if exists streaks cascade;
drop table if exists closeness cascade;
drop table if exists conflict_state cascade;
drop table if exists active_game cascade;
drop table if exists milestones cascade;
drop table if exists message_reactions cascade;
drop table if exists playlist cascade;
drop table if exists diary_entries cascade;
drop table if exists user_settings cascade;
drop table if exists push_subscriptions cascade;
drop table if exists messages cascade;
drop table if exists personalities cascade;
drop table if exists user_communication_profile cascade;

-- Drop and recreate users table
drop table if exists users cascade;

create table if not exists users (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  email text,
  photo text,
  role text default 'user',
  created_at timestamptz default now(),
  settings jsonb default '{}'
);

-- Enable vector extension if not already enabled
create extension if not exists vector;

-- Secretary conversation history
create table if not exists secretary_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  role text not null,
  content text not null,
  created_at timestamptz default now()
);

-- Secretary long term memory with RAG
create table if not exists secretary_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  memory_type text not null,
  content text not null,
  embedding vector(1536),
  importance int default 1,
  created_at timestamptz default now(),
  last_referenced timestamptz
);

create index on secretary_memory
using ivfflat (embedding vector_cosine_ops)
with (lists = 100);

-- Tasks and reminders
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  title text not null,
  description text,
  due_date timestamptz,
  completed boolean default false,
  priority text default 'medium',
  tags text[],
  created_at timestamptz default now(),
  completed_at timestamptz
);

-- RAG search function for secretary memory
create or replace function match_secretary_memory(
  query_embedding vector(1536),
  match_user_id uuid,
  match_count int default 8
)
returns table(content text, memory_type text, similarity float)
language sql stable
as $$
  select
    content,
    memory_type,
    1 - (embedding <=> query_embedding) as similarity
  from secretary_memory
  where user_id = match_user_id
    and 1 - (embedding <=> query_embedding) > 0.65
  order by embedding <=> query_embedding
  limit match_count;
$$;

-- Enable RLS on new tables
alter table users enable row level security;
alter table secretary_messages enable row level security;
alter table secretary_memory enable row level security;
alter table tasks enable row level security;

-- RLS policies: users can only access their own data
create policy "Users can view own profile" on users for select using (auth.uid() = id);
create policy "Users can update own profile" on users for update using (auth.uid() = id);
create policy "Users can insert own profile" on users for insert with check (auth.uid() = id);

create policy "Users can view own messages" on secretary_messages for select using (auth.uid() = user_id);
create policy "Users can insert own messages" on secretary_messages for insert with check (auth.uid() = user_id);
create policy "Users can delete own messages" on secretary_messages for delete using (auth.uid() = user_id);

create policy "Users can view own memory" on secretary_memory for select using (auth.uid() = user_id);
create policy "Users can insert own memory" on secretary_memory for insert with check (auth.uid() = user_id);
create policy "Users can delete own memory" on secretary_memory for delete using (auth.uid() = user_id);

create policy "Users can view own tasks" on tasks for select using (auth.uid() = user_id);
create policy "Users can insert own tasks" on tasks for insert with check (auth.uid() = user_id);
create policy "Users can update own tasks" on tasks for update using (auth.uid() = user_id);
create policy "Users can delete own tasks" on tasks for delete using (auth.uid() = user_id);
