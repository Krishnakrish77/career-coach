-- PRD 2: private preferences, persisted explainable scorecards, and feedback.
alter table profiles add column target_titles jsonb not null default '[]';
alter table profiles add column target_locations jsonb not null default '[]';
alter table profiles add column remote_preference text;
alter table profiles add column salary_min numeric;
alter table profiles add column work_authorization text;
alter table profiles add column excluded_companies jsonb not null default '[]';
alter table profiles add constraint profiles_remote_preference_check
  check (remote_preference is null or remote_preference in ('remote', 'hybrid', 'onsite', 'flexible'));

alter table job_matches add column must_have_fit_score numeric;
alter table job_matches add column location_fit_score numeric;
alter table job_matches add column compensation_fit_score numeric;
alter table job_matches add column job_quality_score numeric;
alter table job_matches add column recommendation text;
alter table job_matches add column confidence text;
alter table job_matches add column score_explanation jsonb not null default '{}';
alter table job_matches add constraint job_matches_recommendation_check
  check (recommendation is null or recommendation in ('apply_now', 'tailor_first', 'network_first', 'maybe_later', 'skip', 'needs_review'));
alter table job_matches add constraint job_matches_confidence_check
  check (confidence is null or confidence in ('low', 'medium', 'high'));

create table job_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,
  action_taken text not null check (action_taken in ('overridden', 'skipped', 'archived', 'not_interested')),
  reason text,
  created_at timestamptz not null default now()
);
create index job_feedback_user_job_created_idx on job_feedback (user_id, job_id, created_at desc);
alter table job_feedback enable row level security;
create policy "own job_feedback" on job_feedback for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
