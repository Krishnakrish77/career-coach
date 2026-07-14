# Tech Debt

## Move Model Selection Out Of End-User Settings

Status: Implementation complete — deployment validation pending
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

Status: Resolved
Area: Resume upload, ATS readiness, Edge Functions
Created: 2026-07-13

### Context

The current PDF upload flow flags PDFs without an obvious text layer before extraction. It does not hard-block them because a raw-byte check cannot reliably distinguish compressed/object-stream text PDFs from scanned resumes. Image-based resumes are still poor ATS inputs and require careful review.

However, text-layer PDFs still use a temporary AI extraction fallback. That is overkill for normal resumes: deterministic PDF text extraction should be cheaper, faster, more private, and easier to reason about.

### Target State

- Extract embedded/selectable PDF text with a maintained parser first.
- Reject scanned, image-only, or OCR-dependent PDFs with a clear ATS warning.
- Warn on image-heavy PDFs even when a text layer exists.
- Use AI only as an explicit fallback for malformed text-layer PDFs, never to hide a scanned resume problem.
- Surface extraction confidence and warnings in the Resume tab before the user saves.

### Acceptance Criteria

- [x] Flag PDFs with no obvious text layer before extraction without falsely rejecting compressed/object-stream PDFs.
- [x] Warn on image-heavy PDFs that still expose a text layer.
- [x] Add parser-first extraction for embedded PDF text.
- [x] Keep the AI fallback behind an explicit server-side flag.
- [ ] Add integration tests using representative text-layer, scanned, image-heavy, and malformed PDF fixtures in the Edge runtime.
