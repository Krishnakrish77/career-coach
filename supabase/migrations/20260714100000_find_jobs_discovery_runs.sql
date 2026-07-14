-- API-first Find Jobs runs are private to the initiating user. Source data is
-- retained only as compact provenance to make recommendations auditable.
create table discovery_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  status text not null default 'running' check (status in ('running', 'completed', 'partial_failure', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  requested_limit integer not null default 12 check (requested_limit between 1 and 30),
  source_summaries jsonb not null default '[]',
  error_message text
);
create index discovery_runs_user_started_idx on discovery_runs (user_id, started_at desc);
alter table discovery_runs enable row level security;
create policy "own discovery_runs" on discovery_runs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table discovered_jobs add column source_external_id text;
alter table discovered_jobs add column source_payload jsonb not null default '{}';
alter table discovered_jobs add column source_query text;
create index discovered_jobs_user_source_external_idx on discovered_jobs (user_id, source, source_external_id) where source_external_id is not null;
