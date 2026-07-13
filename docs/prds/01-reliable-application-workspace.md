# PRD 1: Reliable Application Workspace

Status: Draft
Target horizon: Phase 1, 0-8 weeks
Primary surfaces: extension popup, dashboard jobs tab, resume tab, Supabase tables/functions
Dependency: Current extension capture, resume upload, tailoring, ATS scoring, and tracking

## Problem

Career Coach already has the core loop: capture a job, store a resume, tailor documents, score ATS match, and track status. The next product step is making that loop dependable enough for daily use by a stressed job seeker.

Today the product is useful but still fragile as a personal workflow system. A user can save jobs and generate materials, but they need stronger capture quality, duplicate protection, resume versioning, clear output management, and follow-up tracking before the product can become their primary search workspace.

## Goals

- Increase trust in the basic job-search workflow.
- Reduce duplicate, incomplete, and low-quality saved jobs.
- Make resume setup and version management explicit.
- Make tailoring outputs easy to review, copy, export, and revisit.
- Make every application status have a next-step path.

## Non-Goals

- Bulk job discovery.
- Full application autofill.
- Interview practice.
- Job recommendations from external boards.
- Recruiter or employer-facing workflows.

## Target Users

- Active job seekers capturing roles from LinkedIn, Indeed, company career pages, and niche boards.
- Users applying repeatedly over multiple weeks who need confidence that their job data and generated materials will not be lost.
- Users who are not ready for automation until the foundation feels trustworthy.

## User Stories

- As a job seeker, I want the extension to detect duplicate jobs so my tracker does not become messy.
- As a job seeker, I want to know whether a captured job has enough usable description text before I spend time tailoring.
- As a job seeker, I want to maintain resume versions so I can test positioning without losing my base resume.
- As a job seeker, I want generated resume and cover-letter outputs saved separately so I can reuse and compare them.
- As a job seeker, I want follow-up dates and notes so applications do not disappear after submission.

## MVP Scope

| ID | Requirement | Priority | Notes |
| --- | --- | --- | --- |
| RAW-1 | Detect duplicate jobs by normalized URL, company, title, and posting text hash. | P0 | Show "already saved" in popup and link to existing job. |
| RAW-2 | Add capture quality states: complete, partial, and needs review. | P0 | Based on title, company, URL, and description length. |
| RAW-3 | Add editable title, company, location, and job description fields in job detail. | P0 | Current capture will not always parse perfectly. |
| RAW-4 | Add resume version history with active version selection. | P0 | Store uploaded PDF/text source metadata and extracted text. |
| RAW-5 | Add resume health check before tailoring. | P0 | Missing email, phone, work history, skills, obvious parse failure, too-short resume. |
| RAW-6 | Split tailored resume and cover letter into saved artifacts. | P0 | Each artifact should include provider, model, generated date, source job, source resume version. |
| RAW-7 | Add copy and plain-text export for each tailored artifact. | P0 | PDF/DOCX can wait for PRD 3. |
| RAW-8 | Add application notes and next follow-up date. | P0 | Display in job detail and jobs list. |
| RAW-9 | Add jobs search and filters by status, company, score range, and follow-up due. | P1 | Keeps tracker usable above 25 jobs. |
| RAW-10 | Add empty, error, loading, and retry states across capture, resume extraction, tailor, and scoring. | P1 | Clear recovery paths are part of trust. |

## UX Requirements

- The popup should answer one question quickly: "Is this job saved, saveable, or already in my tracker?"
- The dashboard should make the next action visible for each job: review, tailor, apply, follow up, prepare, archive.
- Users should be able to edit bad capture fields without losing the original source URL.
- Resume version selection should be visible before tailoring.
- ATS score must be displayed as directional guidance with matched and missing skills, not as a claim that an ATS will accept or reject the candidate.

## Data And Technical Implications

Likely schema additions:

- `resume_versions`
  - `id`
  - `user_id`
  - `label`
  - `source_type`
  - `source_filename`
  - `resume_text`
  - `is_active`
  - `created_at`
- `job_artifacts`
  - `id`
  - `user_id`
  - `job_id`
  - `resume_version_id`
  - `artifact_type`
  - `content`
  - `provider`
  - `model`
  - `created_at`
- Extend `jobs`
  - `capture_quality`
  - `normalized_url`
  - `content_hash`
  - `location`
- Extend `applications`
  - `notes`
  - `next_follow_up_at`

Implementation notes:

- Keep RLS scoped to `auth.uid()` for all new tables.
- Keep LLM calls server-side through Edge Functions.
- Create deterministic duplicate checks client-side first, then confirm server-side to avoid race conditions.
- Preserve current `resumes` compatibility or migrate carefully to `resume_versions`.

## Success Metrics

- 90 percent of saved jobs have title, company, URL, and sufficient description text.
- Duplicate saves reduced by 90 percent after duplicate detection ships.
- 80 percent of active users create or confirm an active resume version.
- 70 percent of tailoring runs result in a saved artifact.
- Median time from captured job to generated packet under 5 minutes.
- 60 percent of applied jobs have a next follow-up date or explicit "no follow-up" marker.

## Rollout Plan

1. Add schema migration and data-access tests.
2. Ship duplicate detection and capture quality in popup.
3. Ship editable job detail fields and job filters.
4. Ship resume version history and health check.
5. Ship saved artifacts and copy/export.
6. Ship notes and follow-up dates.

## Risks And Guardrails

- Resume versioning can confuse users if the UI exposes too much structure. Default to one active resume and hide advanced history until needed.
- Duplicate detection can accidentally merge distinct jobs with the same title. Treat matches as suggestions unless URL is an exact match.
- Resume health checks can feel judgmental. Phrase issues as fixes, not grades.
- Saved artifacts increase storage volume. Store text efficiently and avoid saving raw PDFs unless there is an explicit user reason.

## Open Questions

- Should resume versions replace the existing `resumes` table or sit beside it for compatibility?
- Should the popup allow quick edit of title/company, or should edits only happen in the dashboard?
- Should follow-up reminders use browser notifications, email, or dashboard-only due indicators in the first release?
