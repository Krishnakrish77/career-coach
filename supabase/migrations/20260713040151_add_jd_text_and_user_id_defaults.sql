-- jd_text holds the raw captured page text; jd_json stays reserved for future
-- structured extraction (extract-job Edge Function) so the two shapes never mix.
alter table jobs add column jd_text text;

-- Let the client insert without knowing/passing user_id explicitly; it's always
-- the calling user's own id when going through the anon key + their JWT.
-- Service-role writes (e.g. future shared job-board ingestion) still pass an
-- explicit user_id (null for the shared pool), which simply overrides the default.
alter table jobs alter column user_id set default auth.uid();
alter table resumes alter column user_id set default auth.uid();
alter table applications alter column user_id set default auth.uid();
alter table job_matches alter column user_id set default auth.uid();
alter table interview_stories alter column user_id set default auth.uid();
alter table profiles alter column user_id set default auth.uid();
