-- PRD 1 (Reliable Application Workspace): duplicate detection, capture quality,
-- resume version history, per-generation artifacts, and follow-up tracking.

-- ---- jobs: dedup fields + editable location + capture quality ----
alter table jobs add column normalized_url text;
alter table jobs add column content_hash text;
alter table jobs add column capture_quality text not null default 'needs_review';
alter table jobs add column location text;

alter table jobs add constraint jobs_capture_quality_check
  check (capture_quality in ('complete', 'partial', 'needs_review'));

-- One saved job per (user, normalized_url). Rows with no normalized_url yet
-- (existing captures, or shared-pool rows with user_id null) are unaffected —
-- a partial unique index ignores rows outside its where clause.
create unique index jobs_user_normalized_url_key
  on jobs (user_id, normalized_url)
  where user_id is not null and normalized_url is not null;

-- ---- resumes: version metadata + one active version per user ----
alter table resumes add column label text;
alter table resumes add column source_type text not null default 'text';
alter table resumes add column source_filename text;
alter table resumes add column is_active boolean not null default true;

alter table resumes add constraint resumes_source_type_check
  check (source_type in ('text', 'pdf'));

-- Backfill: only the newest existing resume per user stays active.
update resumes set is_active = false
where id not in (
  select distinct on (user_id) id from resumes order by user_id, created_at desc
);

create unique index resumes_user_active_key on resumes (user_id) where is_active;

-- Atomic active-version swap. The client inserts new versions inactive first,
-- then calls this RPC; if activation fails, the existing active version remains
-- active because the function runs as one database transaction.
create or replace function public.activate_resume_version(p_resume_id uuid)
returns public.resumes
language plpgsql
security invoker
set search_path = public
as $$
declare
  activated public.resumes;
begin
  update public.resumes
  set is_active = false
  where user_id = auth.uid()
    and is_active = true
    and id <> p_resume_id;

  update public.resumes
  set is_active = true
  where id = p_resume_id
    and user_id = auth.uid()
  returning * into activated;

  if activated.id is null then
    raise exception 'resume version not found';
  end if;

  return activated;
end;
$$;

grant execute on function public.activate_resume_version(uuid) to authenticated;

-- ---- job_artifacts: one row per tailoring generation, kept for history ----
create table job_artifacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,
  resume_version_id uuid references resumes(id) on delete set null,
  artifact_type text not null check (artifact_type in ('tailored_resume', 'cover_letter')),
  content text not null,
  provider text,
  model text,
  created_at timestamptz not null default now()
);

-- Same pattern as every other user-scoped table: client inserts without
-- passing user_id, it defaults to the caller's own id.
alter table job_artifacts alter column user_id set default auth.uid();

create index job_artifacts_user_job_created_idx on job_artifacts (user_id, job_id, created_at desc);

alter table job_artifacts enable row level security;
create policy "own job_artifacts" on job_artifacts for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---- applications: follow-up tracking ----
alter table applications add column notes text;
alter table applications add column next_follow_up_at timestamptz;
