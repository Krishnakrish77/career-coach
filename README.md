<p align="center">
  <img src="icons/logo.png" alt="Career Coach" width="420">
</p>

Career Coach is a Chrome extension that helps you run a job search: capture postings as you browse, triage fit and quality, generate tailored application materials, track follow-up, prepare for interviews, and plan the week — backed by Supabase (Postgres + Auth + Edge Functions), not a server you have to run yourself.

## What it does today

- **Capture** — one click in the popup saves the current tab's job posting text, dedupes by normalized URL, and flags capture quality
- **Tailor** — generates a tailored resume + cover letter per job via the server-controlled hosted model
- **ATS match + opportunity triage** — tailoring creates ATS match output, and the dashboard can assess broader fit, quality, confidence, and recommended next action
- **Resume upload** — paste text, or upload a PDF; scanned/image-only PDFs are flagged because they are poor ATS inputs
- **Application packets** — create review-required packets with resume, cover letter, recruiter note, LinkedIn note, short answer, copy/text/DOCX/PDF export, and submission tracking
- **Discovery queue** — manually import public jobs, score them against preferences, and like/save/skip/hide recommendations before they enter the tracker
- **Interview prep** — maintain a STAR story bank, draft story seeds from your resume, generate likely questions, match stories, save practice feedback, and track prep checklists
- **Weekly plan** — set capacity/targets, generate a focused plan, manage reminders, and save a weekly retrospective
- **Track** — per-job application status (`saved` -> `applied` -> `interviewing` -> `offer`/`rejected`), notes, and next follow-up dates
- **Multi-device** — signed-in accounts, data lives in Supabase, not just one browser's local storage

See [Still incomplete](#still-incomplete-honest-roadmap) for the important gaps that remain before a broader user release.

For the product roadmap, market research, and phase-by-phase PRDs, see [docs/prds](docs/prds/README.md). For known product/engineering follow-up work, see [docs/tech-debt.md](docs/tech-debt.md).

## Architecture

```
Extension (Chrome, MV3)
├─ extension/popup.html + popup.js       — sign in/up, capture the current tab, last 3 captures, link to dashboard
├─ extension/dashboard.html + dashboard.js — full-page workspace: Jobs, Discovery, Resume, Interview Prep, Weekly Plan, Settings
├─ extension/styles.css                  — shared design tokens/components used by both surfaces
└─ src/
   ├─ storage.js                         — chrome.storage.local wrapper for the auth session
   ├─ supabase-auth.js                   — email/password auth against Supabase's GoTrue REST API
   └─ supabase-db.js                     — PostgREST calls (jobs/resumes/applications) + calls the `tailor`/`extract-resume` Edge Functions

Supabase
├─ Postgres — resumes, profiles, jobs, applications, job_matches, packets, discovery, interviews, coaching (RLS-scoped per user)
├─ Auth — email/password; the extension holds the resulting JWT
├─ Edge Function `tailor` — runs the LLM call server-side with the operator's own API key
│  and server-controlled provider/model config, so no LLM key or raw model choice ever lives
│  in the browser. Enforces a model allowlist, a per-job debounce,
│  a per-user hourly cap before spending on a call, and also computes the ATS match score
│  (stored in `job_matches`) as part of the same call.
└─ Edge Function `extract-resume` — checks whether a PDF has a detectable text layer,
   blocks scanned/OCR-dependent resumes as not ATS-safe, then extracts text. This should
   move to parser-first extraction; AI extraction is only a temporary fallback path.
```

Why a backend at all, for a browser extension: RLS is what makes per-user data isolation real (not just "the UI happens to filter"), and moving the LLM call server-side means the operator's API key — not each user's own — pays for tailoring, which is what makes signup viable for people who don't have their own Anthropic/OpenAI account.

## Project layout

```
manifest.json                 MV3 manifest — permissions, icons, popup entry point
extension/                    Browser extension UI entrypoints and shared CSS
  popup.html / popup.js       Popup UI (thin: auth + capture only)
  dashboard.html / dashboard.js Full-page dashboard (opened in its own tab)
  styles.css                  Shared design tokens + components
src/                          Shared extension modules
  storage.js                  chrome.storage.local wrapper
  supabase-auth.js            Auth: signUp/signIn/refreshSession/getValidSession
  supabase-db.js              Data: listJobs/getJob/insertJob/updateJob/updateApplicationStatus/
                               updateApplicationNotes/deleteJob/saveResume/getLatestResume/
                               listJobArtifacts/tailorJob/extractResumeFromPdf
test/*.test.js                Node built-in test runner (node --test), no framework/deps
icons/                        icon.svg (source) + rasterized PNGs + logo.svg/png
supabase/migrations/*.sql     Schema, in order — see below
supabase/functions/tailor/    Edge Function: the only place an LLM key is used
supabase/config.toml          Local Supabase project config (synced to the live project via `supabase config push`)
```

## Prerequisites

- [Node.js](https://nodejs.org) 18+ (for running tests — the extension itself ships no build step)
- Chrome (or any Chromium-based browser that supports MV3 extensions)
- [Supabase CLI](https://supabase.com/docs/guides/cli) (`brew install supabase/tap/supabase` on macOS)
- A Supabase project and an API key for the server-selected tailoring provider. `ANTHROPIC_API_KEY` is also required while PDF extraction still uses the temporary AI fallback.

## Setup

1. **Clone and install.** No build step; tests use Node's built-in runner.
   ```
   npm test
   ```

2. **Link the Supabase CLI to your project.**
   ```
   supabase login
   supabase link --project-ref <your-project-ref>
   ```

3. **Push the schema.** Applies the migrations in `supabase/migrations/` (resumes/profiles/jobs/applications/job_matches/interview_stories tables, RLS policies, constraints, indexes).
   ```
   supabase db push --password '<your-db-password>'
   ```

4. **Set the operator's LLM key(s) as Edge Function secrets.** `ANTHROPIC_API_KEY` is required while PDF extraction still uses the temporary AI fallback, and it is also the default tailoring provider. Set `TAILOR_PROVIDER` / `TAILOR_MODEL` only when the hosted deployment should use a different allowlisted model.
   ```
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   supabase secrets set TAILOR_PROVIDER=anthropic   # optional; default is anthropic
   supabase secrets set TAILOR_MODEL=claude-haiku-4-5 # optional; must be allowlisted
   supabase secrets set OPENAI_API_KEY=sk-...       # only if TAILOR_PROVIDER=openai
   supabase secrets set GEMINI_API_KEY=...          # only if TAILOR_PROVIDER=gemini
   ```

5. **Deploy both Edge Functions.**
   ```
   supabase functions deploy tailor --use-api
   supabase functions deploy extract-resume --use-api
   ```
   (`--use-api` bundles server-side without needing Docker running locally.)

6. **Point the extension and auth redirects at your project.** These values are hardcoded today (this is a single-deployment personal project, not yet parameterized for forks):
   - `src/supabase-auth.js` — `SUPABASE_URL` and `SUPABASE_ANON_KEY` (the **publishable** key — safe to embed client-side, RLS is the actual security boundary)
   - `src/supabase-auth.js` — `AUTH_LANDING_URL`, the public URL for `docs/auth.html` after you publish the docs site
   - `manifest.json` — `host_permissions` must list your project's `https://<ref>.supabase.co/*`
   - `supabase/config.toml` — `[auth].site_url` and `additional_redirect_urls` must include the same `AUTH_LANDING_URL` so invite and password-reset links can redirect there

7. **Load the extension.** `chrome://extensions` → enable Developer mode → "Load unpacked" → select this directory.

## Using it

Signup is invite-only on the hosted project (public self-signup is disabled — see [Security notes](#security-notes)). To invite someone: Supabase Dashboard → Authentication → Users → **Invite user** → enter their email. They'll get an email with a link to `docs/auth.html` to set their password; from there:

1. Open the popup, log in.
2. Browse to a job posting, click **Save current tab**.
3. Click **Open dashboard →**. In the **Resume** tab, paste your resume once.
4. In the **Jobs** tab, assess the opportunity, tailor the resume + cover letter, and create an application packet.
5. Track status, notes, follow-up dates, interview prep, and weekly plan actions from the dashboard.

Forgot your password? Use the "Forgot password?" link in the popup — same `docs/auth.html` page handles both invite and password-reset links.

## Development

```
npm test          # runs every test/*.test.js via Node's built-in test runner — no Jest/Mocha/etc.
```

Tests mock `fetch` via dependency injection (every network function takes an optional `fetchImpl` parameter) rather than stubbing globals — see `test/supabase-auth.test.js` / `test/supabase-db.test.js` for the pattern.

To iterate on an Edge Function, redeploy the one you changed:
```
supabase functions deploy tailor --use-api          # after any change to supabase/functions/tailor/index.ts
supabase functions deploy extract-resume --use-api  # after any change to supabase/functions/extract-resume/index.ts
```

To add a schema change: `supabase migration new <name>`, edit the generated SQL, then `supabase db push --password '...'`.

**One-time setup after cloning** — run the test suite locally on every push, so most failures never reach GitHub Actions:
```
git config core.hooksPath .githooks
```
(`core.hooksPath` is a local git setting, not something git syncs on clone — every clone needs to run this once.)

## CI / releases

- **CI** (`.github/workflows/ci.yml`) runs on PRs and pushes to `main` only — not every branch push, and not on docs/icon-only changes (`paths-ignore`). A new push to the same PR cancels the previous run in progress rather than letting a stale one finish. This is a backstop: the pre-push hook above should already catch most failures before they ever reach Actions.
- **Supabase migrations** (`.github/workflows/supabase-migrations.yml`) runs when `supabase/migrations/**` or `supabase/config.toml` changes. PRs preview the migration diff against the linked project with a dry run. After merge to `main`, pending migrations apply through the protected `production` environment, which should require an explicit deployment approval. Configure repository secrets `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, and either a `SUPABASE_PROJECT_REF` repo variable or secret before relying on it.
- **Pages** (`.github/workflows/pages.yml`) deploys `docs/*.html` and `docs/assets/**` to GitHub Pages whenever those change on `main` (or via manual `workflow_dispatch`). It stages only those files before upload, so `docs/prds/**` and `docs/tech-debt.md` — repo-internal planning docs, not site content — never get published and don't trigger a redeploy when edited.
- **Releases** (`.github/workflows/release.yml`) only fire on a `v*` tag push — never on a normal commit. To cut one:
  ```
  # bump "version" in manifest.json and package.json to match, then:
  git add manifest.json package.json
  git commit -m "Release vX.Y.Z"
  git tag vX.Y.Z
  git push && git push --tags
  ```
  This zips `manifest.json` + `extension/` + `icons/` + `src/` (excluding `test/`, `supabase/`, and this README) and attaches it to a new GitHub release — ready to upload to the Chrome Web Store as-is.

## Security notes

- **API keys never reach the browser.** The `tailor` Edge Function holds the operator's LLM keys as secrets; the client only sends the selected job ID.
- **RLS on every table**, scoped to `auth.uid()` — the actual isolation boundary between users, not just UI filtering.
- **Abuse guards on `tailor`**: a server-side model allowlist, a 15-second per-job debounce, and a 20-calls/hour per-user cap, backed by a single `applications.last_tailored_at` column rather than a separate rate-limiting service.
- **No `innerHTML` with untrusted data.** Job titles/descriptions (from arbitrary web pages) and LLM output are rendered via `textContent`/`.value`, never string-interpolated into HTML. Job URLs are validated to `http(s)` before ever becoming a real link.
- **Invite-only signup.** Public self-registration is disabled (`enable_signup = false`) — this repo is public and `SUPABASE_URL`/the publishable key are visible in the source (by design, see below), so open signup would let anyone spend the operator's AI budget via `tailor`. New users are added via Supabase Dashboard → Authentication → Users → Invite.
- **`SUPABASE_URL`/`SUPABASE_ANON_KEY` are meant to be public.** They identify the project and are required in any client-side call — RLS, not key secrecy, is the actual boundary. The `service_role` key and every LLM API key are the real secrets, and those only ever exist as Edge Function secrets, never in this repo or the browser.

## Still incomplete (honest roadmap)

The foundation is broader now, but these are still not production-complete:

- Automated job-source ingestion or broad job-board scanning. Discovery is currently user-imported/manual.
- Rich preference learning from accumulated liked/skipped/applied jobs. Current scoring is deterministic and early.
- Parser-first PDF extraction. Scanned/OCR-dependent PDFs are blocked today, but text-layer PDFs still use a temporary AI extraction path.
- Deep grounded generation for packet items beyond the tailored resume and cover letter. Some packet content is still template-based and review-required.
- Social/profile enrichment implementation. The PRD exists, but the import/consent/revocation flow is not built.
- Self-service account/data deletion in the extension.
- Automated Edge Function deployment; migrations are automated, functions are still deployed manually.

## License

MIT. See [LICENSE](LICENSE).
