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
