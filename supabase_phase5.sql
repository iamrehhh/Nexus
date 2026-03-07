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
