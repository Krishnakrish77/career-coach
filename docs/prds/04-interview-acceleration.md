# PRD 4: Interview Acceleration

Status: Draft
Target horizon: Phase 5, 16-26 weeks
Primary surfaces: dashboard interview tab, job detail, story bank
Dependencies: Application Packet, tracked application status

## Problem

Most job-search tools stop after resume tailoring or application tracking, but job seekers win offers through interviews. In a slower market with more AI-mediated screening, candidates need faster access to role-specific prep, concise evidence, and practice answering under pressure.

Career Coach should help users convert interviews into offers by turning their real experience into a reusable story bank and job-specific prep plan.

## Goals

- Create a structured story bank from resume, user input, and prior application packets.
- Generate role-specific likely questions and answer outlines.
- Help users practice concise, evidence-backed answers.
- Prepare users for AI-led and human interviews.
- Link interview prep to each tracked job and outcome.

## Non-Goals

- Real-time interview cheating.
- Live transcription or hidden answer generation during an actual interview.
- Guaranteeing interview outcomes.
- Evaluating protected-class traits, appearance, accent, or personality.
- Replacing human coaching for high-stakes negotiations or specialized interview loops.

## Target Users

- Users whose applications have moved to interviewing.
- Early-career users who lack polished STAR stories.
- Career switchers who need to connect prior experience to new roles.
- Users facing AI-led screens or asynchronous video interviews.

## User Stories

- As a job seeker, I want a set of stories I can reuse across interviews so I do not start from scratch.
- As a job seeker, I want questions tailored to the specific job description.
- As a job seeker, I want to know which stories best answer each question.
- As a job seeker, I want practice feedback on clarity, evidence, length, and relevance.
- As a job seeker, I want prep for AI-led interviews so I can decide how to approach them.

## MVP Scope

| ID | Requirement | Priority | Notes |
| --- | --- | --- | --- |
| IA-1 | Add story bank CRUD with STAR fields: situation, task, action, result, reflection. | P0 | Reuse existing `interview_stories` schema if possible. |
| IA-2 | Extract candidate story seeds from resume and packets. | P0 | Require user confirmation before saving as stories. |
| IA-3 | Tag stories by skills, role themes, impact type, seniority, and confidence. | P0 | Tags power matching. |
| IA-4 | Generate likely questions from job description and fit gaps. | P0 | Behavioral, role-specific, company, gap-defense, and logistics. |
| IA-5 | Match best stories to each likely question. | P0 | Show why each story fits. |
| IA-6 | Add practice mode with timed text answers. | P1 | Voice/video can wait. |
| IA-7 | Add answer feedback for structure, specificity, length, evidence, and role alignment. | P1 | Avoid personality judgments. |
| IA-8 | Add interview prep checklist per job. | P1 | Company research, role themes, questions to ask, logistics. |

## UX Requirements

- Interview prep should appear automatically when a job status changes to interviewing.
- Story bank creation should be guided but editable.
- The user should be able to mark a story as sensitive or private and exclude it from generation.
- Feedback should be practical and specific, not generic encouragement.
- The product should clearly state that it is for preparation, not live interview assistance.

## Story Bank Model

Each story should include:

- Title.
- Situation.
- Task.
- Action.
- Result.
- Reflection or learning.
- Skills demonstrated.
- Role themes.
- Metrics or evidence.
- Source: resume, user-created, imported from packet, or extracted draft.
- Confidence: user-confirmed, needs review, incomplete.
- Sensitivity flag.

## Data And Technical Implications

Likely schema additions or extensions:

- Extend `interview_stories`
  - `title`
  - `situation`
  - `task`
  - `action`
  - `result`
  - `reflection`
  - `skills`
  - `themes`
  - `source_type`
  - `confidence`
  - `is_sensitive`
- Add `interview_prep_sessions`
  - `id`
  - `user_id`
  - `job_id`
  - `question`
  - `answer_text`
  - `feedback`
  - `created_at`

Implementation notes:

- Keep story extraction grounded in existing resume and packet content.
- Never infer sensitive attributes.
- Use structured JSON outputs from Edge Functions with validation.
- Add tests for missing stories, sensitive story exclusion, and feedback bounds.

## Success Metrics

- 60 percent of users who reach interviewing create or confirm at least three stories.
- 70 percent of interviewing jobs have a generated prep plan.
- 50 percent of prep users complete at least one practice answer.
- Users report improved preparedness after prep sessions.
- Interview-to-next-stage conversion improves for users who complete prep vs those who do not.

## Rollout Plan

1. Ship story bank CRUD.
2. Add story extraction from resume with user confirmation.
3. Add job-specific likely questions.
4. Add story matching.
5. Add text practice and feedback.
6. Add interview prep checklist.
7. Explore voice practice only after text practice is working.

## Risks And Guardrails

- Practice tools can become live-interview assistance if positioned poorly. Keep copy and UX focused on prep.
- AI feedback can reinforce bias if it judges accent, tone, appearance, or personality. Do not evaluate those dimensions.
- Extracted stories can be wrong or exaggerated. Require user confirmation before use.
- Users may feel overwhelmed by too many questions. Default to a focused set of high-probability questions.

## Open Questions

- Should the first version support only text practice, or is microphone-based answer capture essential?
- Which interview types should be first: behavioral, product, engineering, sales, customer support, or general screening?
- Should interview outcomes feed back into weekly coaching in Phase 6?
