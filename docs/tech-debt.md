# Tech Debt

## Move Model Selection Out Of End-User Settings

Status: Resolved
Area: Settings, Edge Functions, hosted product defaults
Created: 2026-07-13
Resolved: 2026-07-13

### Context

The dashboard currently lets signed-in users choose the AI provider and raw model ID for tailoring. That made sense while testing multiple providers, but it is the wrong default for a hosted end-user product.

The operator's server-side API keys pay for generation, and the product is responsible for cost, quality, reliability, and schema-compatible output. Most job seekers do not benefit from choosing between Anthropic, OpenAI, Gemini, or raw model IDs.

### Resolution

- Removed the provider/model picker from the dashboard Settings UI.
- Updated the browser client so tailoring requests send only `job_id`.
- Updated `tailor` so hosted deployments resolve provider/model server-side from `TAILOR_PROVIDER` and `TAILOR_MODEL`, with allowlisted fallbacks.
- Kept provider/model metadata on `job_artifacts` for audit/debugging.
- Updated README, docs site, and privacy copy so they no longer imply end users choose raw providers/models.

### Target State

- Hosted product controls provider/model server-side.
- End users do not see raw model IDs.
- If user choice is needed, expose simple modes such as `Fast`, `Balanced`, or `Best quality`.
- Self-hosted/dev deployments can still configure provider/model through environment variables or admin/developer configuration.
- Generated artifacts continue to store provider/model for audit and debugging.
- Server-side allowlists remain in place so clients cannot request arbitrary expensive models.

### Acceptance Criteria

- [x] Remove or hide the current provider/model picker from the normal dashboard Settings UI.
- [x] Update `tailor` so provider/model defaults are resolved from server-controlled configuration.
- [ ] Optionally accept a simple generation mode from the client and map it to allowlisted models server-side.
- [x] Update README, docs site copy, and privacy copy so they no longer imply end users pick raw providers/models in the hosted product.
- [x] Keep provider/model metadata on `job_artifacts` rows.

## Replace AI PDF Extraction With Parser-First Extraction

Status: Open
Area: Resume upload, ATS readiness, Edge Functions
Created: 2026-07-13

### Context

The current PDF upload flow now blocks PDFs with no detectable text layer before extraction, which prevents scanned or OCR-dependent resumes from being silently converted by AI. That is the right product behavior because image-based resumes are poor ATS inputs.

However, text-layer PDFs still use a temporary AI extraction fallback. That is overkill for normal resumes: deterministic PDF text extraction should be cheaper, faster, more private, and easier to reason about.

### Target State

- Extract embedded/selectable PDF text with a maintained parser first.
- Reject scanned, image-only, or OCR-dependent PDFs with a clear ATS warning.
- Warn on image-heavy PDFs even when a text layer exists.
- Use AI only as an explicit fallback for malformed text-layer PDFs, never to hide a scanned resume problem.
- Surface extraction confidence and warnings in the Resume tab before the user saves.

### Acceptance Criteria

- [x] Block PDFs with no detectable text layer before any AI/provider call.
- [x] Warn on image-heavy PDFs that still expose a text layer.
- [ ] Add parser-first extraction for embedded PDF text.
- [ ] Keep the AI fallback behind an explicit server-side flag or remove it.
- [ ] Add tests using representative text-layer, scanned, image-heavy, and malformed PDFs.
