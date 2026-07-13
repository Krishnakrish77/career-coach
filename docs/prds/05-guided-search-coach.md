# PRD 5: Guided Search Coach

Status: Draft
Target horizon: Phase 5, 24-36 weeks
Primary surfaces: dashboard home, weekly plan, insights, reminders
Dependencies: Reliable Workspace, Opportunity Triage, Application Packet, Interview Acceleration

## Problem

Job search is a multi-week operating cadence, not a one-time document task. Users need to know what to do this week, whether their strategy is working, and when to change direction. Without a feedback loop, users can spend months repeating the same low-conversion behavior.

Career Coach should become a lightweight productized coach that turns tracked activity and outcomes into a weekly plan.

## Goals

- Help users set realistic weekly job-search targets.
- Convert application and interview outcomes into actionable insight.
- Recommend when to adjust target roles, resume positioning, job sources, or networking effort.
- Reduce overwhelm through a clear plan and limited priority actions.
- Support sustainable pace without manipulative streak mechanics.

## Non-Goals

- Mental-health coaching or therapy.
- Financial advice.
- Guaranteed job placement.
- Replacing human coaches.
- Employer outreach automation without explicit user action.

## Target Users

- Active job seekers searching over multiple weeks.
- Users who have enough tracked activity to identify patterns.
- Users who feel stuck and need a structured plan.
- Users balancing job search with work, school, caregiving, or burnout risk.

## User Stories

- As a job seeker, I want a weekly plan so I know what to focus on first.
- As a job seeker, I want to know whether my application-to-interview rate is improving.
- As a job seeker, I want the product to tell me when I should refine my resume, target different roles, or increase networking.
- As a job seeker, I want reminders that help me follow up without feeling spammed.
- As a job seeker, I want to see progress even when I have not received offers yet.

## MVP Scope

| ID | Requirement | Priority | Notes |
| --- | --- | --- | --- |
| GSC-1 | Add onboarding goals: target role, weekly capacity, urgency, preferred locations, salary floor, and constraints. | P0 | Reuse profile preferences from PRD 2 where possible. |
| GSC-2 | Add weekly plan with 3-5 priority actions. | P0 | Examples: review 10 roles, apply to 5 strong-fit roles, follow up on 3, prep for 1 interview. |
| GSC-3 | Add activity and outcome analytics. | P0 | Saved, skipped, applied, interviews, offers, rejections, follow-ups. |
| GSC-4 | Add application-to-interview conversion view. | P0 | Segment by role title, source, score band, and week. |
| GSC-5 | Add recommendation rules for search pivots. | P0 | Example: 30 applications with no interviews triggers resume/targeting review. |
| GSC-6 | Add reminder center for follow-ups and prep tasks. | P1 | Browser notifications can be optional. |
| GSC-7 | Add weekly retrospective. | P1 | What worked, what did not, what to adjust. |
| GSC-8 | Add exportable progress summary. | P2 | Useful for coaches, accountability partners, or workforce programs. |

## Coaching Rules

Initial deterministic rules:

- If resume setup is incomplete, prioritize resume health before applications.
- If many jobs are saved but few are triaged, prioritize queue cleanup.
- If many low-score jobs are applied to, recommend tighter targeting.
- If 20-50 applications produce no interviews, recommend resume/target-role review.
- If interviews occur but no next-stage movement, recommend interview prep and story refinement.
- If follow-ups are overdue, prioritize follow-up before new applications.
- If the user repeatedly skips roles for the same reason, suggest updating preferences.

Rules should be explainable and editable. They should not shame users.

## UX Requirements

- The dashboard home should show today's top actions, not a wall of analytics.
- Weekly plan should be adjustable based on user capacity.
- Insights should be written as hypotheses, not verdicts.
- Users should be able to snooze, dismiss, or change reminders.
- The product should celebrate real progress carefully: completed prep, improved targeting, follow-up completion, and interviews, not only offers.

## Data And Technical Implications

Likely schema additions:

- `job_search_goals`
  - `user_id`
  - `target_titles`
  - `weekly_application_target`
  - `weekly_networking_target`
  - `weekly_prep_target`
  - `capacity_hours`
  - `urgency`
  - `created_at`
  - `updated_at`
- `weekly_plans`
  - `id`
  - `user_id`
  - `week_start`
  - `plan_status`
  - `summary`
  - `created_at`
- `weekly_plan_items`
  - `id`
  - `weekly_plan_id`
  - `item_type`
  - `description`
  - `target_count`
  - `completed_count`
  - `status`
- `search_insights`
  - `id`
  - `user_id`
  - `insight_type`
  - `message`
  - `evidence`
  - `confidence`
  - `created_at`

Implementation notes:

- Most first-version coaching can be deterministic rules over existing data.
- LLM summarization can help phrase weekly reviews, but should not be required for core planning.
- Keep notification permissions opt-in.
- Add analytics without third-party tracking by deriving metrics from the user's own Supabase data.

## Success Metrics

- 60 percent of active users create a weekly goal plan.
- 50 percent of weekly plan users complete at least half of assigned actions.
- 40 percent of weekly plan users return the next week.
- Users using weekly planning improve application-to-interview conversion over four weeks.
- Users report higher clarity on next actions in feedback.

## Rollout Plan

1. Add goal onboarding and dashboard home.
2. Add weekly plan generation from deterministic rules.
3. Add outcome analytics and conversion views.
4. Add reminder center.
5. Add weekly retrospective.
6. Add LLM-assisted insight summaries after deterministic rules are stable.

## Risks And Guardrails

- Overly aggressive reminders can increase stress. Default to fewer, high-signal tasks.
- Analytics can be discouraging for users in a difficult market. Frame insights around controllable actions.
- Users with little data may get weak recommendations. Use setup tasks and general best-practice plans until enough data exists.
- Conversion comparisons must not imply that the user is personally at fault for market conditions.

## Open Questions

- Should weekly plans be generated on a calendar week or from the user's chosen reset day?
- Should the product support multiple search tracks, such as "Product Manager" and "Customer Success" simultaneously?
- Which monetization boundary makes sense: free tracker plus paid coaching, paid exports, or team/program licensing?
