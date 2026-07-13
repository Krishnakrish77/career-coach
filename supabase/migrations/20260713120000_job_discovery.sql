-- PRD 6: user-initiated discovery stays separate from the saved-job workspace.
alter table profiles add column title_aliases jsonb not null default '[]';
alter table profiles add column industries jsonb not null default '[]';
alter table profiles add column seniority_targets jsonb not null default '[]';

create table discovered_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  source text not null default 'manual_import',
  source_url text not null,
  normalized_url text not null,
  content_hash text,
  title text,
  company text,
  location text,
  jd_text text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  freshness_status text not null default 'new' check (freshness_status in ('new', 'recent', 'stale')),
  unique (user_id, normalized_url)
);
create index discovered_jobs_user_seen_idx on discovered_jobs (user_id, last_seen_at desc);
alter table discovered_jobs enable row level security;
create policy "own discovered_jobs" on discovered_jobs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table job_recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  discovered_job_id uuid not null references discovered_jobs(id) on delete cascade,
  preference_fit_score numeric not null,
  resume_fit_score numeric,
  job_quality_score numeric not null,
  recommendation_label text not null check (recommendation_label in ('strong_match', 'worth_reviewing', 'like_based', 'needs_preference_review', 'low_priority', 'hidden')),
  reasoning jsonb not null default '{}',
  status text not null default 'new' check (status in ('new', 'seen', 'liked', 'saved', 'skipped', 'hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, discovered_job_id)
);
create index job_recommendations_user_status_idx on job_recommendations (user_id, status, updated_at desc);
alter table job_recommendations enable row level security;
create policy "own job_recommendations" on job_recommendations for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table job_preference_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  discovered_job_id uuid references discovered_jobs(id) on delete cascade,
  sentiment text not null check (sentiment in ('positive', 'negative')),
  action text not null check (action in ('like', 'save', 'apply', 'skip', 'hide', 'not_relevant')),
  reasons jsonb not null default '[]',
  created_at timestamptz not null default now()
);
alter table job_preference_feedback enable row level security;
create policy "own job_preference_feedback" on job_preference_feedback for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
