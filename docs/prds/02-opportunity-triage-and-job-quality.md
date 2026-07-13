# PRD 2: Opportunity Triage And Job Quality

Status: Draft
Target horizon: Phase 2, 6-12 weeks
Primary surfaces: dashboard jobs tab, job detail, popup saved confirmation
Dependency: Reliable Application Workspace

## Problem

Job seekers waste large amounts of time on roles that are poor fits, stale, vague, suspicious, or unlikely to convert. AI tools have made application volume cheaper, but that can make the user's search worse by encouraging undisciplined activity.

Career Coach should help users answer: "Is this job worth my time right now?"

## Goals

- Prioritize jobs by fit, quality, and urgency.
- Identify roles that need networking before applying.
- Flag low-confidence, stale, suspicious, or likely low-return postings.
- Turn ATS scoring into a broader opportunity scorecard.
- Encourage intentional skip decisions, not just more saved jobs.

## Non-Goals

- Guaranteeing that a job is real or fake.
- Scraping private job-board data behind authentication walls.
- Replacing the user's judgment.
- Making hiring or eligibility decisions for employers.
- Auto-applying to jobs.

## Target Users

- Active job seekers with more saved roles than they can apply to.
- Users who are applying widely but not getting interviews.
- Users who suspect some postings are stale, scammy, or not worth the effort.

## User Stories

- As a job seeker, I want to sort saved jobs by which ones are most worth applying to today.
- As a job seeker, I want to understand whether a low score is caused by missing skills, seniority mismatch, work authorization, location, compensation, or poor posting quality.
- As a job seeker, I want to flag a job as "network first" when the role is competitive or high value.
- As a job seeker, I want to skip bad postings without feeling like I failed to be productive.
- As a job seeker, I want the product to explain recommendations so I can make my own decision.

## MVP Scope

| ID | Requirement | Priority | Notes |
| --- | --- | --- | --- |
| OTJ-1 | Add a scorecard with dimensions: resume match, must-have skills, seniority fit, location/remote fit, work authorization risk, compensation fit, and job quality. | P0 | Each dimension should include confidence and explanation. |
| OTJ-2 | Add a recommended action: apply now, tailor first, network first, maybe later, skip, or needs review. | P0 | Recommendation must cite scorecard factors. |
| OTJ-3 | Add job-quality signals: stale/reposted, vague description, suspicious compensation, external application mismatch, missing company identity, and excessive requirements. | P0 | Use deterministic heuristics first. |
| OTJ-4 | Add "why this score" UI with evidence from the posting and resume. | P0 | No black-box score only. |
| OTJ-5 | Add user preferences for target titles, locations, remote policy, salary floor, work authorization, and excluded companies. | P0 | Needed for personalized triage. |
| OTJ-6 | Add queue views: Apply Today, Network First, Needs Review, Skip/Archive. | P1 | Helps users work through jobs intentionally. |
| OTJ-7 | Add "not interested because" reasons to improve future recommendations. | P1 | Reasons: level, location, pay, industry, company, poor posting, duplicate, other. |
| OTJ-8 | Add confidence labels to every recommendation. | P1 | Low confidence should trigger review, not assertive advice. |

## Scorecard Model

The scorecard should produce separate factors before any aggregate score:

- Resume match: current ATS-style match from `job_matches`.
- Must-have skill gap: requirements listed as required but missing from resume/profile.
- Seniority fit: inferred role level compared with user's target and experience.
- Location fit: remote, hybrid, onsite, commute, timezone, relocation.
- Work authorization risk: visa sponsorship, citizenship, clearance, local eligibility.
- Compensation fit: posted range vs user minimum when available.
- Job quality: posting freshness, completeness, company identity, suspicious language, external URL consistency.
- Strategic value: target company, target role, learning value, referral availability.

Recommended aggregate labels:

- Strong pursue.
- Pursue with tailoring.
- Network before applying.
- Low priority.
- Skip.
- Needs manual review.

Avoid precise claims like "82 percent chance of interview." The product does not have enough signal for that.

## UX Requirements

- The jobs list should support triage at a glance without hiding the explanation.
- Each job detail should show the top three positive signals and top three concerns.
- "Skip" should be a first-class productive outcome.
- The UI should let users override recommendations and capture why.
- The scorecard must distinguish "missing from resume" from "missing from your actual experience." If unsure, ask the user to add evidence rather than recommending fabrication.

## Data And Technical Implications

Likely schema additions:

- Extend `profiles`
  - `target_titles`
  - `target_locations`
  - `remote_preference`
  - `salary_min`
  - `work_authorization`
  - `excluded_companies`
- Extend `job_matches`
  - `role_fit_score`
  - `level_fit_score`
  - `location_fit_score`
  - `compensation_fit_score`
  - `job_quality_score`
  - `recommendation`
  - `confidence`
  - `score_explanation`
- Add `job_feedback`
  - `job_id`
  - `user_id`
  - `action_taken`
  - `reason`
  - `created_at`

Implementation notes:

- Use deterministic extraction and heuristics where possible before LLM scoring.
- Treat external web verification as optional for MVP because extension context and network constraints vary.
- Persist individual factors, not just aggregate scores.
- Build tests for score range, missing inputs, low-confidence cases, and recommendation mapping.

## Success Metrics

- 75 percent of saved jobs receive a scorecard within one minute of capture or first review.
- 50 percent of active users use a queue filter weekly.
- 30 percent of saved jobs receive an intentional skip/archive decision.
- Users report at least a 20 percent reduction in "not sure what to apply to next" sentiment in qualitative feedback.
- Application-to-interview conversion improves for users who use triage compared with users who only use tailoring.

## Rollout Plan

1. Add profile preferences.
2. Add deterministic posting-quality heuristics.
3. Extend scorecard storage and Edge Function output.
4. Ship scorecard UI in job detail.
5. Add queue views and recommended action filters.
6. Add user feedback loops and use them to tune recommendation rules.

## Risks And Guardrails

- False ghost-job or scam flags can damage user trust. Use "risk signals" and "confidence," not definitive labels.
- Scores can create score-chasing behavior. Pair every score with practical next steps.
- Work authorization and compensation are sensitive. Keep preferences private, editable, and optional.
- Some users will want to apply anyway. Make override easy.

## Open Questions

- What is the smallest set of user preferences required for useful triage?
- Should job-quality scoring rely only on captured page content for MVP, or should it optionally check company career pages?
- Should "network first" require a contact tracker in this phase or simply create a task?
