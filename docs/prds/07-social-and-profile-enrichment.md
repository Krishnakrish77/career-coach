# PRD 7: Social And Profile Enrichment

Status: Proposed — privacy and consent review required before implementation  
Target horizon: Phase 3.5, after Job Discovery and Preference Learning  
Primary surfaces: profile settings, explicit import flow, profile review, networking preparation  
Dependencies: Reliable Application Workspace, Job Discovery and Preference Learning

## Problem

Users often maintain useful professional facts across a resume, personal website, portfolio, and public professional profiles. Re-entering those facts is tedious, and a stale profile can make job recommendations, application drafts, and networking preparation less useful.

However, profile data is highly personal. It can include contact details, employment history, education, location, connections, posts, and information that should not influence job-search decisions. An enrichment feature must therefore be opt-in, narrow in scope, understandable before data is collected, and reversible at any time.

The goal is not to build a people-search product, scrape social networks, or infer who a user is. The goal is to help a user bring selected, user-visible professional facts into their own workspace for review.

## Goals

- Let a user explicitly choose a supported profile or document to import.
- Extract only the professional fields needed to improve the user's Career Coach profile, resume review, and networking preparation.
- Show every imported field, its source, and the intended use before it affects recommendations or generated drafts.
- Make import consent specific, revocable, and easy to audit.
- Keep imported social/profile data private to the user and minimize retention.

## Non-Goals

- Scraping login-protected pages, private profiles, or a user's social graph.
- Bypassing site terms, robots controls, API limits, or access restrictions.
- Importing or enriching information about other people, recruiters, hiring managers, or contacts.
- Inferring protected characteristics, personality, seniority, compensation, political beliefs, health, family status, or work authorization from profile data.
- Automatically publishing, messaging, connecting, endorsing, or changing any third-party profile.
- Replacing a resume or treating profile text as verified employment evidence.

## Target Users

- Job seekers with an up-to-date public portfolio, personal website, or professional profile they want to reuse.
- Users who want help identifying stale or missing fields in their Career Coach profile.
- Users preparing for networking who need a reviewed summary of their own stated experience.

## User Stories

- As a job seeker, I want to import a profile URL or upload an export that I control so I do not have to retype my professional history.
- As a job seeker, I want to see exactly what will be read and why before I approve an import.
- As a job seeker, I want to review and selectively accept imported fields rather than overwrite my existing profile.
- As a job seeker, I want to know which saved field came from which source and when it was imported.
- As a job seeker, I want to revoke consent and delete the imported source and derived fields whenever I choose.
- As a job seeker, I want my imported profile to improve recommendations only after I explicitly allow that use.

## Consent And Privacy Requirements

Consent is a product requirement, not a settings footnote. Before any fetch, upload, or parse operation, the UI must present a concise consent screen that names:

- The exact source the user selected (URL, upload, or supported provider connection).
- The categories to be read: headline, summary, roles, skills, education, portfolio links, and user-selected contact details.
- The purpose of each selected category: profile completion, resume review, recommendation context, or networking-prep drafts.
- Whether the source content will be stored, how long it will be retained, and how to delete it.
- Any external processor involved in extraction or generation, if applicable.

Required controls:

| ID | Requirement | Priority | Notes |
| --- | --- | --- | --- |
| SPE-1 | Require an explicit, unselected consent checkbox immediately before import. | P0 | Consent may not be bundled with general terms or remembered for a different source. |
| SPE-2 | Let the user choose field categories and downstream uses before import. | P0 | Recommendation use is off by default. |
| SPE-3 | Show a review screen with field-level accept, edit, and reject actions. | P0 | No imported field silently overwrites a user-confirmed value. |
| SPE-4 | Record consent version, timestamp, source type, selected categories, and selected uses. | P0 | Audit data must not contain source content. |
| SPE-5 | Provide one-click revocation and deletion from Settings. | P0 | Stop future processing immediately; delete raw source and derived data according to the deletion model. |
| SPE-6 | Re-request consent when source scope, field categories, processor, or purpose materially changes. | P0 | Do not rely on stale consent. |
| SPE-7 | Keep imports private under RLS and exclude them from analytics by default. | P0 | Only aggregated, opt-in product analytics may be considered later. |

## MVP Scope

| ID | Requirement | Priority | Notes |
| --- | --- | --- | --- |
| SPE-8 | Support user-uploaded profile exports and user-provided public URLs for a small allowlist of sources. | P0 | Start with personal websites/portfolios and exports; do not add authenticated social integrations in MVP. |
| SPE-9 | Fetch or parse only after consent and only for the chosen source. | P0 | No background crawling, periodic refresh, or link-following. |
| SPE-10 | Extract a constrained schema: headline, summary, roles, skills, education, portfolio links, and optional contact fields. | P0 | Contact fields remain opt-in and are not used for ranking. |
| SPE-11 | Save field provenance, confidence, import timestamp, and user approval state. | P0 | Provenance is visible in the profile review UI. |
| SPE-12 | Merge accepted facts into a separate profile-draft layer. | P0 | User-approved values remain canonical; unresolved conflicts remain drafts. |
| SPE-13 | Allow an explicit opt-in to use approved professional skills and roles as recommendation context. | P1 | Explain the effect in plain language. |
| SPE-14 | Generate a user-reviewable networking bio or outreach context from approved facts. | P1 | Never send or publish it. |
| SPE-15 | Display import history and deletion status. | P1 | Enables user audit and support investigation. |

## UX Requirements

### Import flow

1. The user starts from **Settings → Profile enrichment** and chooses a source type.
2. The user supplies a URL or upload and sees the source-specific data categories and purposes.
3. The user selects categories and uses, checks consent, and explicitly chooses **Import for review**.
4. Career Coach retrieves/parses only that source and displays a clear “review required” result.
5. The user accepts, edits, or rejects each field. Accepted values are added as profile drafts with provenance; no automatic overwrite occurs.
6. The user can optionally enable the approved professional facts for recommendation context. This is a separate toggle from import consent.

### Transparency

- Every imported field must show its source, import date, and whether it is a draft or user-confirmed.
- The UI must state that profile information can be incomplete, outdated, or inaccurate and should be reviewed.
- The UI must clearly separate “stored source content” from “accepted profile fields.”
- If a source cannot be fetched lawfully or reliably, explain why and offer a paste/upload alternative; do not attempt workarounds.
- Deletion UI must state what will be deleted, what user-confirmed values will remain, and the expected completion state.

### Accessibility

- Consent language must be readable without hover-only disclosures.
- Field-review controls must be keyboard operable and screen-reader labeled.
- Import progress and failure states must be announced using live regions.
- The decision to enable recommendation use must not be preselected.

## Data Model And Technical Implications

Proposed tables:

- `profile_enrichment_sources`
  - `id`, `user_id`, `source_type`, `source_url` (when applicable), `status`
  - `consent_version`, `consented_at`, `selected_categories`, `selected_uses`
  - `imported_at`, `deleted_at`, `retention_expires_at`
- `profile_enrichment_fields`
  - `id`, `user_id`, `source_id`, `field_type`, `value`, `provenance`
  - `confidence`, `approval_status`, `approved_at`, `rejected_at`, `created_at`
- `profile_enrichment_audit_events`
  - `id`, `user_id`, `source_id`, `event_type`, `consent_version`, `metadata`, `created_at`

Implementation boundaries:

- Raw fetched content should be ephemeral by default. Retain it only when the user explicitly chooses to keep a source for later review, with a documented expiry.
- Store normalized approved fields separately from raw source content.
- Encrypt sensitive values at rest where platform support is available; do not log source content, tokens, or contact details.
- Apply RLS to every table using `auth.uid() = user_id` and verify all queries with RLS tests.
- Use server-side allowlists and URL validation. Block local/private network URLs and unsupported schemes.
- A provider connection, if ever added, must use the provider's documented authorization flow and least-privilege scopes. Tokens must be stored securely and deleted on revocation.
- AI extraction may only receive the selected content categories and must return structured fields with validation. It must not infer missing facts.

## Trust And Safety Guardrails

- Do not collect data about anyone other than the signed-in user.
- Do not process a URL that appears to belong to another person unless the user can affirm ownership and the supported source permits it; MVP should avoid this ambiguity by limiting sources to uploads and personal sites.
- Never infer demographic or sensitive attributes from names, photos, pronouns, location, schools, employers, language, or connections.
- Do not use imported contacts, followers, or network relationships for recommendation ranking or outreach suggestions.
- Never send data to an LLM or external processor without disclosing that processor in the consent flow.
- Do not train models on profile-source content without separate, explicit opt-in consent.
- Revocation stops further use immediately. Derived fields used only because of the revoked source must be removed or marked unavailable unless the user independently confirmed them.

## Success Metrics

- 80% of users who begin an import reach the consent screen without confusion or abandonment caused by unclear scope.
- 90% of completed imports include at least one field-level review action.
- Fewer than 5% of accepted imported fields are later edited as inaccurate within 30 days.
- 100% of source deletion requests complete with a visible success or recoverable failure state.
- No profile import occurs without a corresponding consent audit record in acceptance tests.

## Rollout Plan

1. Complete privacy, legal, and security review; define supported sources and retention policy.
2. Ship the consent UI, audit records, deletion controls, and profile-draft review without any third-party profile connection.
3. Add user-uploaded exports and personal-site URLs behind a feature flag.
4. Validate field provenance, deletion, RLS, SSRF protections, and accessibility with automated and manual tests.
5. Consider narrow, documented provider integrations only after consent/revocation and data-deletion flows are proven reliable.
6. Consider recommendation-context opt-in only after users understand and control the imported profile layer.

## Risks

- Users may assume an import authorizes broader monitoring. Copy and controls must make the one-time, source-specific scope explicit.
- A third-party platform's policies or APIs may change. Unsupported sources must fail safely without scraping alternatives.
- Imported profiles may be stale or embellished. Treat every field as review-required until user approved.
- Contact details and source text increase breach impact. Minimize collection, avoid logs, and make deletion reliable.
- Enrichment can introduce bias into recommendations. Restrict context to user-approved role/skill facts and audit ranking inputs.

## Open Questions

- Which source types can be supported with clear authorization and stable terms: personal sites, exported files, or official provider APIs?
- What retention period, if any, should apply when a user chooses to retain raw source content for review?
- Which fields are useful enough to justify import, and which should remain manual-only?
- Should contact details be excluded entirely from the first release?
- What deletion guarantees and support workflow are required for backups and external processors?
