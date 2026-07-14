-- User-provided source context and editable, draft-only outreach for a saved role.
-- No contacts, messages, or automatic research are stored or performed here.
create table company_research_briefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,
  source_url text,
  source_notes text not null default '',
  brief jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, job_id)
);

create index company_research_briefs_user_updated_idx
  on company_research_briefs (user_id, updated_at desc);

alter table company_research_briefs enable row level security;
create policy "own company_research_briefs" on company_research_briefs for all
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from jobs
      where jobs.id = company_research_briefs.job_id
        and jobs.user_id = auth.uid()
    )
  );
