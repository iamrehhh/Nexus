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
