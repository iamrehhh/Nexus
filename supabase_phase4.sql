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
