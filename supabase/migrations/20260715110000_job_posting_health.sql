-- A current, user-visible health summary lives on jobs for efficient tracker
-- rendering. The append-only checks table keeps the result explainable and
-- makes per-user throttling enforceable without trusting the client.
alter table jobs
  add column if not exists posting_status text not null default 'unverified'
    check (posting_status in ('unverified', 'active', 'likely_expired', 'needs_review')),
  add column if not exists posting_checked_at timestamptz,
  add column if not exists posting_check_reason text,
  add column if not exists posting_check_http_status integer;

create table job_health_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,
  status text not null check (status in ('active', 'likely_expired', 'needs_review')),
  checker text not null check (checker in ('greenhouse_api', 'lever_api', 'public_url')),
  reason text not null,
  http_status integer,
  checked_at timestamptz not null default now()
);

create index job_health_checks_user_checked_idx on job_health_checks (user_id, checked_at desc);
create index job_health_checks_job_checked_idx on job_health_checks (job_id, checked_at desc);

alter table job_health_checks enable row level security;
create policy "own job_health_checks" on job_health_checks for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
