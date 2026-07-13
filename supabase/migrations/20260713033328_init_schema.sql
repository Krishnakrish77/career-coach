-- Career Coach — initial schema
-- profiles/resumes = who the user is; jobs = postings (captured or ingested);
-- job_matches = computed fit per (user, job); applications = user-tracked status per (user, job);
-- interview_stories = STAR+R story bank, reusable across jobs.

create extension if not exists vector;

-- ---- resumes (versioned raw text; profile is derived from the latest one) ----
create table resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  raw_text text not null,
  created_at timestamptz not null default now()
);

-- ---- profiles (one row per user; the extracted "fingerprint") ----
create table profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  resume_id uuid references resumes(id) on delete set null,
  skills jsonb not null default '[]',
  seniority text,
  years_experience numeric,
  domains jsonb not null default '[]',
  role_history jsonb not null default '[]',
  embedding vector(1536),
  updated_at timestamptz not null default now()
);

-- ---- jobs (user_id null = shared discovery pool from scheduled ingestion) ----
create table jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  source text not null default 'manual', -- 'manual' | 'greenhouse' | 'lever' | 'adzuna' | ...
  url text not null,
  title text,
  company text,
  jd_json jsonb not null default '{}',
  embedding vector(1536),
  created_at timestamptz not null default now()
);

-- ---- job_matches (computed fit scorecard, one per user+job) ----
create table job_matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,
  role_fit_score numeric,
  cv_match_score numeric,
  level_fit_score numeric,
  comp_score numeric,
  personalization_score numeric,
  overall_grade text, -- 'A' .. 'F'
  legitimacy_flag boolean not null default false,
  legitimacy_reasoning text,
  matched_skills jsonb not null default '[]',
  missing_skills jsonb not null default '[]',
  reasoning text,
  created_at timestamptz not null default now(),
  unique (user_id, job_id)
);

-- ---- applications (user-tracked status per job; separate from computed score) ----
create table applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,
  status text not null default 'saved', -- 'saved' | 'applied' | 'interviewing' | 'offer' | 'rejected'
  tailored_resume text,
  cover_letter text,
  updated_at timestamptz not null default now(),
  unique (user_id, job_id)
);

-- ---- interview_stories (STAR+R bank, reusable across jobs) ----
create table interview_stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  situation text,
  task text,
  action text,
  result text,
  reflection text,
  tags text[] not null default '{}',
  source_job_id uuid references jobs(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---- vector similarity indexes ----
create index profiles_embedding_idx on profiles using hnsw (embedding vector_cosine_ops);
create index jobs_embedding_idx on jobs using hnsw (embedding vector_cosine_ops);

-- ---- row-level security: every table is scoped to its own user, except the shared job pool ----
alter table resumes enable row level security;
alter table profiles enable row level security;
alter table jobs enable row level security;
alter table job_matches enable row level security;
alter table applications enable row level security;
alter table interview_stories enable row level security;

create policy "own resumes" on resumes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own profile" on profiles for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own job_matches" on job_matches for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own applications" on applications for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own interview_stories" on interview_stories for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- jobs: everyone can read the shared pool (user_id is null) or their own captured jobs;
-- only the owner (or nobody, for pool rows inserted by the service role) can write.
create policy "read own or shared jobs" on jobs for select using (user_id is null or auth.uid() = user_id);
create policy "insert own jobs" on jobs for insert with check (auth.uid() = user_id);
create policy "update own jobs" on jobs for update using (auth.uid() = user_id);
create policy "delete own jobs" on jobs for delete using (auth.uid() = user_id);
