-- User-confirmed accomplishments are separate from interview stories: they
-- can be reused in tailoring and outreach without forcing STAR formatting.
create table career_evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  evidence_text text not null check (char_length(evidence_text) between 1 and 3000),
  skills text[] not null default '{}',
  review_status text not null default 'needs_review'
    check (review_status in ('user_confirmed', 'needs_review')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index career_evidence_user_updated_idx on career_evidence (user_id, updated_at desc);
alter table career_evidence enable row level security;
create policy "own career_evidence" on career_evidence for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Tone and phrase guidance belongs to the existing per-user profile. It is
-- advisory only; tailoring still rejects invented claims and unsafe requests.
alter table profiles add column if not exists writing_guidance jsonb not null default '{}';

-- Records the titles of verified evidence supplied as context for the current
-- tailored draft. This is provenance, not a claim that every item appeared in
-- the generated copy.
alter table applications add column if not exists tailoring_evidence text[] not null default '{}';
