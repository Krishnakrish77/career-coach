# PRD 3: Application Packet And Assisted Apply

Status: Draft
Target horizon: Phase 4, 10-18 weeks
Primary surfaces: dashboard job detail, popup/current tab assistant, export flows
Dependencies: Reliable Application Workspace, Opportunity Triage

## Problem

Once a user decides a job is worth pursuing, the remaining work is still fragmented: tailor the resume, write a cover letter, answer custom questions, send a recruiter note, copy details into application forms, and track the submission. This repetitive work is where users lose momentum.

Career Coach should turn a selected job into a complete, reviewable application packet and help the user submit it faster without taking control away from them.

## Goals

- Reduce the time from "worth applying" to "ready to submit."
- Produce a saved packet containing all materials for a specific job.
- Support common outputs: tailored resume, cover letter, short-answer drafts, recruiter message, and follow-up message.
- Assist form filling with explicit review and user confirmation.
- Preserve user agency and prevent accidental submission.

## Non-Goals

- Applying automatically without the user.
- Creating fake experience or credentials.
- Solving every custom ATS form.
- Bypassing website terms or access controls.
- Managing recruiter inbox/email sending in MVP.

## Target Users

- Job seekers applying to multiple roles per week who need speed and consistency.
- Users who tailor materials but waste time copying and reformatting.
- Users who need help with short-answer questions like "Why are you interested?" or "Describe your relevant experience."

## User Stories

- As a job seeker, I want one packet per job so I can see exactly what I submitted.
- As a job seeker, I want to copy or export my tailored resume and cover letter in common formats.
- As a job seeker, I want help answering custom application questions using my real experience.
- As a job seeker, I want form fill suggestions but I want to review every field before it is entered.
- As a job seeker, I want the system to record the submitted date and next follow-up task after I apply.

## MVP Scope

| ID | Requirement | Priority | Notes |
| --- | --- | --- | --- |
| APA-1 | Create an application packet object per job. | P0 | Packet contains resume artifact, cover letter, notes, messages, and short answers. |
| APA-2 | Generate recruiter message and LinkedIn connection note. | P0 | Grounded in job, company, and resume evidence. |
| APA-3 | Generate short-answer drafts for common questions. | P0 | Must show source evidence or "needs user input." |
| APA-4 | Add export: copy, plain text, PDF, and DOCX for resume and cover letter. | P0 | DOCX may require a lightweight generation library or server-side function. |
| APA-5 | Add packet review checklist before assisted apply. | P0 | Resume selected, cover letter reviewed, answers reviewed, contact info checked. |
| APA-6 | Add current-page form detection for common fields. | P1 | Name, email, phone, LinkedIn, portfolio, resume upload, cover letter, text answers. |
| APA-7 | Add user-confirmed autofill. | P1 | Preview detected fields and values before writing to the page. |
| APA-8 | Add submission tracking prompt. | P1 | After user indicates submitted, update status and follow-up date. |

## UX Requirements

- The packet should be the central object after a user chooses "apply."
- The UI should clearly separate generated draft, user-edited final, and submitted version.
- Every generated claim should either cite resume/story evidence or ask the user for missing detail.
- Autofill should require an explicit button click after a field preview.
- The extension must never click final submit, next, sign, consent, or payment buttons.

## Application Packet Contents

MVP packet:

- Job snapshot: title, company, location, URL, captured date.
- Fit summary: top strengths, gaps, recommended positioning.
- Tailored resume text.
- Cover letter.
- Recruiter message.
- LinkedIn connection note.
- Short-answer drafts.
- User notes.
- Submission status and date.
- Follow-up task.

Future packet:

- PDF/DOCX files.
- Application screenshots or confirmation number.
- Version comparison.
- Referral/contact activity.
- Interview prep link once status changes to interviewing.

## Data And Technical Implications

Likely schema additions:

- `application_packets`
  - `id`
  - `user_id`
  - `job_id`
  - `resume_id`
  - `status`
  - `created_at`
  - `updated_at`
- `application_packet_items`
  - `id`
  - `packet_id`
  - `item_type`
  - `draft_content`
  - `final_content`
  - `source_evidence`
  - `created_at`
  - `updated_at`
- `application_submissions`
  - `id`
  - `packet_id`
  - `submitted_at`
  - `confirmation_text`
  - `follow_up_at`

Implementation notes:

- Keep DOM form detection in content-script scope only when needed.
- Add host permissions carefully and avoid broad data collection beyond user-triggered current-page actions.
- Use explicit user gestures for all page writes.
- Build field matching as a confidence-ranked suggestion system, not blind mutation.

## Success Metrics

- Median time from recommended "apply now" to ready packet under 7 minutes.
- 70 percent of generated packets have at least one user edit before submission.
- 60 percent of packet users mark submitted or intentionally archive within 72 hours.
- 50 percent of applications have follow-up tasks after submission.
- Zero known auto-submit incidents.

## Rollout Plan

1. Ship packet object and packet UI.
2. Add recruiter and LinkedIn message generation.
3. Add short-answer helper with evidence prompts.
4. Add copy/plain-text/PDF export.
5. Add DOCX export.
6. Ship read-only form detection preview.
7. Add user-confirmed autofill for safe fields.
8. Add submission tracking prompt.

## Risks And Guardrails

- Autofill mistakes are high-trust failures. Start with preview-only and safe fields.
- Some ATS sites block extensions or use complex embedded forms. Offer packet copy/export as the reliable fallback.
- Users may overtrust generated answers. Use evidence labels and "needs your input" blockers.
- Export formatting can consume disproportionate engineering time. Plain text and copy should ship first.

## Open Questions

- Should DOCX export happen client-side or through a Supabase Edge Function?
- Should packets store both draft and final text, or only final text with artifact history?
- Which ATS/form providers should be manually tested first?
