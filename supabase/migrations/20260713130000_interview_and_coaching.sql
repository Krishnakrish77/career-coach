-- PRDs 4 and 5: a private story bank and deterministic weekly coaching.
alter table interview_stories add column if not exists skills text[] not null default '{}';
alter table interview_stories add column if not exists themes text[] not null default '{}';
alter table interview_stories add column if not exists source_type text not null default 'user_created'
  check (source_type in ('user_created', 'resume_seed', 'packet_seed'));
alter table interview_stories add column if not exists confidence text not null default 'user_confirmed'
  check (confidence in ('user_confirmed', 'needs_review', 'incomplete'));
alter table interview_stories add column if not exists is_sensitive boolean not null default false;
alter table interview_stories add column if not exists updated_at timestamptz not null default now();
alter table interview_stories alter column user_id set default auth.uid();

create table interview_prep_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  job_id uuid references jobs(id) on delete cascade,
  question text not null,
  answer_text text not null default '',
  feedback jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index interview_prep_sessions_user_job_created_idx on interview_prep_sessions (user_id, job_id, created_at desc);
alter table interview_prep_sessions enable row level security;
create policy "own interview_prep_sessions" on interview_prep_sessions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table job_search_goals (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  target_titles text[] not null default '{}',
  weekly_application_target integer not null default 3 check (weekly_application_target >= 0),
  weekly_networking_target integer not null default 1 check (weekly_networking_target >= 0),
  weekly_prep_target integer not null default 1 check (weekly_prep_target >= 0),
  capacity_hours numeric not null default 5 check (capacity_hours >= 0),
  urgency text not null default 'normal' check (urgency in ('low', 'normal', 'high')),
  constraints text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table job_search_goals enable row level security;
create policy "own job_search_goals" on job_search_goals for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table weekly_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  week_start date not null,
  plan_status text not null default 'active' check (plan_status in ('active', 'completed', 'archived')),
  summary text not null default '',
  created_at timestamptz not null default now(),
  unique (user_id, week_start)
);
alter table weekly_plans enable row level security;
create policy "own weekly_plans" on weekly_plans for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table weekly_plan_items (
  id uuid primary key default gen_random_uuid(),
  weekly_plan_id uuid not null references weekly_plans(id) on delete cascade,
  item_type text not null,
  description text not null,
  target_count integer not null default 1 check (target_count >= 0),
  completed_count integer not null default 0 check (completed_count >= 0),
  status text not null default 'open' check (status in ('open', 'done', 'dismissed')),
  created_at timestamptz not null default now()
);
alter table weekly_plan_items enable row level security;
create policy "own weekly_plan_items" on weekly_plan_items for all
  using (exists (select 1 from weekly_plans p where p.id = weekly_plan_id and p.user_id = auth.uid()))
  with check (exists (select 1 from weekly_plans p where p.id = weekly_plan_id and p.user_id = auth.uid()));

create table search_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  insight_type text not null,
  message text not null,
  evidence jsonb not null default '{}',
  confidence text not null default 'low' check (confidence in ('low', 'medium', 'high')),
  created_at timestamptz not null default now()
);
alter table search_insights enable row level security;
create policy "own search_insights" on search_insights for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
