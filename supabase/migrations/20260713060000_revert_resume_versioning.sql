-- Revert RAW-4 (resume versioning): product decision to keep one resume per
-- user and always treat the most recently saved one as the source of truth,
-- rather than exposing version labels/activation.
drop function if exists activate_resume_version(uuid);
drop index if exists resumes_user_active_key;

alter table resumes drop column is_active;
alter table resumes drop column label;
alter table resumes drop column source_type;
alter table resumes drop column source_filename;

-- "version" no longer means anything now that there's no version management —
-- it's just which resumes row a given artifact was generated from.
alter table job_artifacts rename column resume_version_id to resume_id;
