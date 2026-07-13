-- Final PRD workflow gaps: preferences, interview prep state, and coaching follow-through.
alter table profiles add column if not exists company_sizes jsonb not null default '[]';

create table interview_prep_checklists (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade, item_key text not null,
  completed boolean not null default false, updated_at timestamptz not null default now(), unique (user_id, job_id, item_key)
);
alter table interview_prep_checklists enable row level security;
create policy "own interview_prep_checklists" on interview_prep_checklists for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table coaching_reminders (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  job_id uuid references jobs(id) on delete cascade, reminder_type text not null, message text not null,
  due_at timestamptz, status text not null default 'open' check (status in ('open', 'snoozed', 'done', 'dismissed')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table coaching_reminders enable row level security;
create policy "own coaching_reminders" on coaching_reminders for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table weekly_retrospectives (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  week_start date not null, worked text not null default '', adjust text not null default '', note text not null default '', created_at timestamptz not null default now(), unique(user_id, week_start)
);
alter table weekly_retrospectives enable row level security;
create policy "own weekly_retrospectives" on weekly_retrospectives for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
