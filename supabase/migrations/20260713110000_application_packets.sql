-- PRD 3: user-owned, reviewable application packets. A packet is deliberately
-- separate from the application status so draft material never implies submit.
create table application_packets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,
  resume_id uuid references resumes(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'reviewed', 'submitted', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, job_id)
);
create index application_packets_user_updated_idx on application_packets (user_id, updated_at desc);
alter table application_packets enable row level security;
create policy "own application_packets" on application_packets for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table application_packet_items (
  id uuid primary key default gen_random_uuid(),
  packet_id uuid not null references application_packets(id) on delete cascade,
  item_type text not null check (item_type in ('tailored_resume', 'cover_letter', 'recruiter_message', 'linkedin_note', 'short_answer', 'user_notes')),
  label text not null default '',
  draft_content text not null default '',
  final_content text,
  source_evidence text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index application_packet_items_type_label_key on application_packet_items (packet_id, item_type, label);
alter table application_packet_items enable row level security;
create policy "own application_packet_items" on application_packet_items for all
  using (exists (select 1 from application_packets p where p.id = packet_id and p.user_id = auth.uid()))
  with check (exists (select 1 from application_packets p where p.id = packet_id and p.user_id = auth.uid()));

create table application_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  packet_id uuid not null unique references application_packets(id) on delete cascade,
  submitted_at timestamptz not null default now(),
  confirmation_text text,
  follow_up_at timestamptz
);
alter table application_submissions enable row level security;
create policy "own application_submissions" on application_submissions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
