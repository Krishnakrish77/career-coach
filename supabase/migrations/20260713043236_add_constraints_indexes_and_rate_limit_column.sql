-- Constraints: status/source were free text with nothing stopping a direct
-- REST call from writing a bogus value (the client's STATUSES list is JS-only).
alter table applications add constraint applications_status_check
  check (status in ('saved', 'applied', 'interviewing', 'offer', 'rejected'));
alter table jobs add constraint jobs_source_check
  check (source in ('manual', 'greenhouse', 'lever', 'adzuna'));

-- Indexes for the query shapes actually used (list by user, newest first).
-- applications has no created_at column — only updated_at.
create index jobs_user_created_idx on jobs (user_id, created_at desc);
create index resumes_user_created_idx on resumes (user_id, created_at desc);
create index applications_user_updated_idx on applications (user_id, updated_at desc);

-- Rate-limiting the tailor Edge Function needs a timestamp that's set ONLY by
-- an actual LLM tailoring call — updated_at also changes on plain status
-- edits, so it can't be reused for this without conflating the two.
alter table applications add column last_tailored_at timestamptz;
create index applications_user_last_tailored_idx on applications (user_id, last_tailored_at);
