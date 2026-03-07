-- ============================================================
-- NEXUS PHASE 1 — SUPABASE MIGRATION
-- Run this entire script in the Supabase SQL Editor
-- WARNING: This drops ALL existing tables
-- ============================================================

-- Drop all old girlfriend app tables
-- 1. DROP ALL OLD AND NEW TABLES TO START FRESH
drop table if exists character_knowledge cascade;
drop table if exists messages cascade;
drop table if exists user_memory cascade;
drop table if exists engagement_state cascade;
drop table if exists interactions cascade;
drop table if exists secretary_messages cascade;
drop table if exists secretary_memory cascade;
drop table if exists conflict_state cascade;
drop table if exists active_game cascade;
drop table if exists milestones cascade;
drop table if exists message_reactions cascade;
drop table if exists playlist cascade;
drop table if exists user_profiles cascade;
drop table if exists user_profile cascade;
drop table if exists streaks cascade;
drop table if exists closeness cascade;
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
-- ============================================================
-- NEXUS PHASE 2 — READING ROOM TABLES
-- Run this in the Supabase SQL Editor
-- ============================================================

-- Books library
create table if not exists books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  title text not null,
  author text,
  file_path text,
  cover_color text default '#6366f1',
  total_pages int default 0,
  current_page int default 0,
  progress float default 0,
  reading_goal_date date,
  status text default 'unread',
  word_count int default 0,
  created_at timestamptz default now(),
  last_read timestamptz
);

-- Individual pages extracted from PDFs
create table if not exists book_pages (
  id uuid primary key default gen_random_uuid(),
  book_id uuid references books(id) on delete cascade,
  page_number int not null,
  content text not null,
  word_count int default 0
);
create index on book_pages(book_id, page_number);

-- Reading sessions for stats
create table if not exists reading_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  book_id uuid references books(id) on delete cascade,
  pages_read int default 0,
  duration_minutes int default 0,
  started_at timestamptz default now(),
  ended_at timestamptz
);

-- Highlights and annotations
create table if not exists book_annotations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  book_id uuid references books(id) on delete cascade,
  page_number int,
  selected_text text not null,
  note text,
  type text default 'highlight',
  color text default 'yellow',
  created_at timestamptz default now()
);

-- Saved vocabulary words
create table if not exists vocabulary (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  book_id uuid references books(id),
  word text not null,
  definition text,
  context text,
  created_at timestamptz default now()
);

-- RLS policies
alter table books enable row level security;
alter table book_pages enable row level security;
alter table reading_sessions enable row level security;
alter table book_annotations enable row level security;
alter table vocabulary enable row level security;

create policy "Users can manage own books" on books for all using (auth.uid() = user_id);
create policy "Users can read own book pages" on book_pages for select using (
  book_id in (select id from books where user_id = auth.uid())
);
create policy "Users can insert own book pages" on book_pages for insert with check (
  book_id in (select id from books where user_id = auth.uid())
);
create policy "Users can delete own book pages" on book_pages for delete using (
  book_id in (select id from books where user_id = auth.uid())
);
create policy "Users can manage own sessions" on reading_sessions for all using (auth.uid() = user_id);
create policy "Users can manage own annotations" on book_annotations for all using (auth.uid() = user_id);
create policy "Users can manage own vocabulary" on vocabulary for all using (auth.uid() = user_id);

-- Storage bucket for books
insert into storage.buckets (id, name, public)
values ('books', 'books', false)
on conflict do nothing;

create policy "Users can upload their own books"
on storage.objects for insert
with check (bucket_id = 'books' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users can read their own books"
on storage.objects for select
using (bucket_id = 'books' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users can delete their own books"
on storage.objects for delete
using (bucket_id = 'books' and auth.uid()::text = (storage.foldername(name))[1]);
-- Phase 3: Health Dashboard

-- Health check-in data (one row per check-in per user)
create table if not exists health_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  checkin_date date not null default current_date,
  data jsonb not null default '{}',
  notes text,
  mood_summary text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, checkin_date)
);

-- User's custom health metrics configuration
create table if not exists health_metrics_config (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  metrics jsonb not null default '[]',
  checkin_schedule text default 'weekly',
  checkin_day int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id)
);

-- AI generated health insights
create table if not exists health_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  insight_text text not null,
  insight_type text default 'weekly',
  generated_at timestamptz default now()
);

-- RLS for health_checkins
alter table health_checkins enable row level security;
create policy "Users can view own health checkins" on health_checkins for select using (auth.uid() = user_id);
create policy "Users can insert own health checkins" on health_checkins for insert with check (auth.uid() = user_id);
create policy "Users can update own health checkins" on health_checkins for update using (auth.uid() = user_id);
create policy "Users can delete own health checkins" on health_checkins for delete using (auth.uid() = user_id);

-- RLS for health_metrics_config
alter table health_metrics_config enable row level security;
create policy "Users can view own health metrics config" on health_metrics_config for select using (auth.uid() = user_id);
create policy "Users can insert own health metrics config" on health_metrics_config for insert with check (auth.uid() = user_id);
create policy "Users can update own health metrics config" on health_metrics_config for update using (auth.uid() = user_id);

-- RLS for health_insights
alter table health_insights enable row level security;
create policy "Users can view own health insights" on health_insights for select using (auth.uid() = user_id);
create policy "Users can insert own health insights" on health_insights for insert with check (auth.uid() = user_id);
create policy "Users can delete own health insights" on health_insights for delete using (auth.uid() = user_id);
-- Connected services storage
create table if not exists connected_services (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  service_name text not null,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  is_connected boolean default false,
  service_data jsonb default '{}',
  scope text,
  connected_at timestamptz default now(),
  last_synced timestamptz,
  unique(user_id, service_name)
);

-- Cached service data (so we don't hit APIs on every page load)
create table if not exists service_cache (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  service_name text not null,
  cache_key text not null,
  data jsonb not null,
  cached_at timestamptz default now(),
  expires_at timestamptz,
  unique(user_id, service_name, cache_key)
);

-- Enable RLS
alter table connected_services enable row level security;
alter table service_cache enable row level security;

-- Policies for connected_services
create policy "Users can only access their own connected services"
on connected_services for all
using (auth.uid() = user_id);

-- Policies for service_cache
create policy "Users can only access their own service cache"
on service_cache for all
using (auth.uid() = user_id);
-- Vault notes
create table if not exists vault_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  title text not null default 'Untitled',
  content text default '',
  content_preview text default '',
  folder text default 'general',
  is_pinned boolean default false,
  is_archived boolean default false,
  tags text[] default '{}',
  color text default 'default',
  word_count int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index on vault_notes(user_id, folder);
create index on vault_notes(user_id, is_pinned);
create index on vault_notes(user_id, updated_at desc);

-- Full text search index
create index on vault_notes using gin(to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, '')));

-- Vault folders
create table if not exists vault_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  name text not null,
  icon text default 'folder',
  color text default '#6366f1',
  note_count int default 0,
  created_at timestamptz default now(),
  unique(user_id, name)
);

-- Note embeddings for semantic search by secretary
create table if not exists vault_embeddings (
  id uuid primary key default gen_random_uuid(),
  note_id uuid references vault_notes(id) on delete cascade,
  user_id uuid references users(id) on delete cascade,
  embedding vector(1536),
  updated_at timestamptz default now(),
  unique(note_id)
);

create index on vault_embeddings
using ivfflat (embedding vector_cosine_ops)
with (lists = 100);

-- Semantic search function for vault
create or replace function search_vault_notes(
  query_embedding vector(1536),
  match_user_id uuid,
  match_count int default 5
)
returns table(
  note_id uuid,
  title text,
  content_preview text,
  folder text,
  similarity float
)
language sql stable
as $$
  select
    vn.id as note_id,
    vn.title,
    vn.content_preview,
    vn.folder,
    1 - (ve.embedding <=> query_embedding) as similarity
  from vault_embeddings ve
  join vault_notes vn on vn.id = ve.note_id
  where ve.user_id = match_user_id
    and 1 - (ve.embedding <=> query_embedding) > 0.6
  order by ve.embedding <=> query_embedding
  limit match_count;
$$;

-- Full text search function
create or replace function search_vault_text(
  search_query text,
  match_user_id uuid,
  match_count int default 10
)
returns table(
  note_id uuid,
  title text,
  content_preview text,
  folder text,
  rank float
)
language sql stable
as $$
  select
    id as note_id,
    title,
    content_preview,
    folder,
    ts_rank(
      to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, '')),
      plainto_tsquery('english', search_query)
    ) as rank
  from vault_notes
  where user_id = match_user_id
    and is_archived = false
    and to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, ''))
        @@ plainto_tsquery('english', search_query)
  order by rank desc
  limit match_count;
$$;

-- RLS Policies
alter table vault_notes enable row level security;
create policy "Users access own notes" on vault_notes for all using (auth.uid() = user_id);

alter table vault_folders enable row level security;
create policy "Users access own folders" on vault_folders for all using (auth.uid() = user_id);

alter table vault_embeddings enable row level security;
create policy "Users access own embeddings" on vault_embeddings for all using (auth.uid() = user_id);
