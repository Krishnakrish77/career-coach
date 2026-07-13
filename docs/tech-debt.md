# Tech Debt

## Move Model Selection Out Of End-User Settings

Status: Open  
Area: Settings, Edge Functions, hosted product defaults  
Created: 2026-07-13

### Context

The dashboard currently lets signed-in users choose the AI provider and raw model ID for tailoring. That made sense while testing multiple providers, but it is the wrong default for a hosted end-user product.

The operator's server-side API keys pay for generation, and the product is responsible for cost, quality, reliability, and schema-compatible output. Most job seekers do not benefit from choosing between Anthropic, OpenAI, Gemini, or raw model IDs.

### Target State

- Hosted product controls provider/model server-side.
- End users do not see raw model IDs.
- If user choice is needed, expose simple modes such as `Fast`, `Balanced`, or `Best quality`.
- Self-hosted/dev deployments can still configure provider/model through environment variables or admin/developer configuration.
- Generated artifacts continue to store provider/model for audit and debugging.
- Server-side allowlists remain in place so clients cannot request arbitrary expensive models.

### Acceptance Criteria

- Remove or hide the current provider/model picker from the normal dashboard Settings UI.
- Update `tailor` so provider/model defaults are resolved from server-controlled configuration.
- Optionally accept a simple generation mode from the client and map it to allowlisted models server-side.
- Update README, docs site copy, and privacy copy so they no longer imply end users pick raw providers/models in the hosted product.
- Keep provider/model metadata on `job_artifacts` rows.

