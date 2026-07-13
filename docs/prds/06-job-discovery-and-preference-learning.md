# PRD 6: Job Discovery And Preference Learning

Status: Draft
Target horizon: Phase 3, after Opportunity Triage and before Assisted Apply
Primary surfaces: dashboard discovery tab, saved search setup, job recommendation queue, job detail feedback
Dependencies: Reliable Application Workspace, Opportunity Triage and Job Quality

## Problem

Career Coach currently starts when a user manually captures a job. That is useful, but active job seekers still spend significant time scanning job boards, repeating searches, opening low-fit postings, and losing track of roles that look interesting but are not yet worth applying to.

The product needs a discovery layer that finds plausible jobs, learns what the user actually likes, and routes only worthwhile roles into the application workflow.

This should not become a generic job board or a bulk-apply engine. The goal is to reduce search waste and surface better-fit opportunities with clear reasons.

## Goals

- Let users define the kinds of jobs they want.
- Learn from explicit positive and negative job feedback.
- Surface recommended jobs with fit, quality, and preference explanations.
- Deduplicate jobs across sources before they enter the user's tracker.
- Give users a lightweight way to like, save, skip, hide, or apply from recommendations.
- Feed preference signals back into triage and weekly coaching.

## Non-Goals

- Scraping private pages or bypassing job-board access controls.
- Becoming a full public job board.
- Auto-applying to discovered jobs.
- Guaranteeing role availability or freshness.
- Building employer/recruiter posting tools.

## Target Users

- Active job seekers who run the same searches repeatedly across LinkedIn, Indeed, company career pages, and niche boards.
- Users who know what they like but have not formalized it into search criteria.
- Users who save too many roles manually and need a better recommendation queue.
- Users whose preferences evolve as they see real postings.

## User Stories

- As a job seeker, I want to specify target job titles, locations, remote preferences, industries, salary expectations, seniority, and work authorization constraints so recommendations start in the right area.
- As a job seeker, I want to mark jobs I like so Career Coach learns my taste beyond keywords.
- As a job seeker, I want to skip jobs with reasons so similar low-value roles are ranked lower.
- As a job seeker, I want recommendations to explain why a job was shown.
- As a job seeker, I want duplicate postings from multiple sources collapsed into one opportunity.
- As a job seeker, I want to save only the roles worth pursuing into my main application workspace.

## MVP Scope

| ID | Requirement | Priority | Notes |
| --- | --- | --- | --- |
| JDP-1 | Add search preference setup: target titles, title aliases, locations, remote policy, salary floor, industries, company size, seniority, work authorization, and excluded companies. | P0 | Reuse profile preferences from PRD 2 where possible. |
| JDP-2 | Add explicit job feedback actions: like, save, apply, skip, hide company, and not relevant. | P0 | Like is a positive preference signal, not an application status. |
| JDP-3 | Add feedback reasons for liked jobs. | P0 | Examples: role scope, company, mission, tech stack, salary, remote, growth, brand, team, industry. |
| JDP-4 | Add feedback reasons for skipped jobs. | P0 | Examples: location, salary, level, company, vague posting, sponsorship, stale, not target role, duplicate. |
| JDP-5 | Add discovery queue states: new, seen, liked, saved, skipped, hidden. | P0 | Keep discovery separate from application tracking until user saves/applies. |
| JDP-6 | Score recommendations using preference fit, resume fit, job quality, freshness, and user constraints. | P0 | Show separate factors, not only one score. |
| JDP-7 | Add "why this job" explanations. | P0 | Cite matched preferences and similar liked jobs when available. |
| JDP-8 | Deduplicate by normalized URL, company/title/location, and posting text hash. | P0 | Collapse board reposts and company-page duplicates. |
| JDP-9 | Start with user-provided job sources or manual import lists. | P1 | Avoid broad scraping in MVP; support pasted URLs, captured search result pages, or curated source configs. |
| JDP-10 | Add weekly recommendation digest inside the dashboard. | P1 | Do not spam notifications by default. |

## Preference Model

The product should combine explicit settings with observed behavior:

- Stated preferences: target roles, locations, remote policy, salary, seniority, industry, company exclusions.
- Positive examples: liked jobs, saved jobs, applied jobs, interview-stage jobs.
- Negative examples: skipped jobs, hidden companies, archived jobs, repeated skip reasons.
- Outcome signals: interviews, rejections, offers, no response after follow-up.

Preference learning rules:

- Explicit user settings override inferred signals.
- Liked jobs should influence recommendations only after the user has given enough examples or reasons.
- Skipped jobs should reduce similar recommendations, but not permanently block a category unless the user chooses a hard exclusion.
- The UI must show when a recommendation is based on "similar to jobs you liked" versus "matches your stated criteria."

## Recommendation Ranking

MVP ranking factors:

- Hard constraints: work authorization, location, remote policy, excluded companies.
- Preference fit: similarity to liked/saved/applied jobs and stated target roles.
- Resume fit: ATS-style match and missing must-have skills.
- Job quality: stale, suspicious, vague, duplicate, or incomplete posting signals.
- Strategic value: target company, target industry, compensation, learning value, referral potential.
- Freshness: newly found or recently updated postings rank above old postings.

Recommended labels:

- Strong match.
- Worth reviewing.
- Like-based recommendation.
- Needs preference review.
- Low priority.
- Hidden.

## UX Requirements

- Discovery should be a queue, not an infinite feed.
- Each recommendation card should show title, company, location/remote, source, freshness, top fit reason, top concern, and actions.
- Primary actions should be `Like`, `Save`, `Skip`, and `Hide`.
- Saving moves the job into the application workspace.
- Liking should not imply the user plans to apply; it teaches preferences.
- Users should be able to inspect and edit their preference profile.
- The product should never present recommendations as guaranteed openings.

## Data And Technical Implications

Likely schema additions:

- `job_search_preferences`
  - `user_id`
  - `target_titles`
  - `title_aliases`
  - `target_locations`
  - `remote_preference`
  - `salary_min`
  - `industries`
  - `company_sizes`
  - `seniority_targets`
  - `work_authorization`
  - `excluded_companies`
  - `updated_at`
- `discovered_jobs`
  - `id`
  - `source`
  - `source_url`
  - `normalized_url`
  - `content_hash`
  - `title`
  - `company`
  - `location`
  - `jd_text`
  - `first_seen_at`
  - `last_seen_at`
  - `freshness_status`
- `job_recommendations`
  - `id`
  - `user_id`
  - `discovered_job_id`
  - `preference_fit_score`
  - `resume_fit_score`
  - `job_quality_score`
  - `recommendation_label`
  - `reasoning`
  - `status`
  - `created_at`
- `job_preference_feedback`
  - `id`
  - `user_id`
  - `job_id`
  - `discovered_job_id`
  - `sentiment`
  - `action`
  - `reasons`
  - `created_at`

Implementation notes:

- Reuse `normalizeUrl`, `content_hash`, and capture-quality utilities where possible.
- Keep discovery rows separate from saved `jobs` until the user chooses to save/apply.
- Use deterministic filters before LLM-based explanations.
- Avoid pulling private job-board pages without user action and permission.
- Add RLS policies so each user's recommendations and preference feedback are private.

## Success Metrics

- 70 percent of active users complete a basic search preference setup.
- 50 percent of recommendations receive a user action: like, save, skip, or hide.
- 25 percent of recommendations are saved into the application workspace.
- Recommendation save rate improves after at least five explicit like/skip signals.
- Users report less time spent manually scanning job boards.
- Application-to-interview conversion for discovered jobs is at least as good as manually captured jobs.

## Rollout Plan

1. Add preference setup and feedback actions on existing saved jobs.
2. Add discovery queue data model and manual import/source ingestion.
3. Add deduplication and recommendation ranking.
4. Add "why this job" explanations.
5. Add dashboard discovery tab.
6. Add weekly recommendation digest.
7. Add broader source integrations only after quality and preference learning work.

## Risks And Guardrails

- Bad recommendations can erode trust quickly. Start with small queues and strong explanations.
- Job-source integrations can become brittle or violate site rules. Prefer user-initiated imports and public/official sources.
- Preference learning can overfit to a few early likes. Use confidence labels and keep user preferences editable.
- Hidden bias can enter recommendations through historical outcomes. Do not infer protected traits or optimize based on them.
- Discovery can increase application volume without quality. Keep triage before packet generation.

## Open Questions

- Should MVP discovery ingest from pasted search-result URLs, saved company career pages, or a small curated list of sources?
- How many liked/skipped jobs are needed before preference-based ranking is trustworthy?
- Should "liked job" examples be weighted more than saved jobs, or should applied/interviewed jobs carry more signal?
- Should discovery recommendations live in a separate table or reuse `jobs` with a discovery status?
- What source freshness threshold should make a job stale by default?

