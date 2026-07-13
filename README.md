<p align="center">
  <img src="icons/logo.png" alt="Career Coach" width="420">
</p>

Career Coach is a Chrome extension that helps you run a job search: capture postings as you browse, generate a tailored resume and cover letter per job, and track application status — backed by Supabase (Postgres + Auth + Edge Functions), not a server you have to run yourself.

## What it does today

- **Capture** — one click in the popup saves the current tab's job posting text
- **Tailor** — generates a tailored resume + cover letter per job via an LLM (Anthropic, OpenAI, or Gemini — your choice in Settings)
- **ATS match scoring** — every tailoring run also produces a 0–100 match score, an A–F grade, and matched/missing skills against that job's posting (stored in `job_matches`, surfaced as a badge in the Jobs list and a full breakdown in the job detail panel)
- **Resume upload** — paste text, or upload a PDF and have it extracted to text automatically (always via Anthropic, regardless of your tailoring provider choice — see Architecture)
- **Track** — per-job application status (`saved` → `applied` → `interviewing` → `offer`/`rejected`)
- **Multi-device** — signed-in accounts, data lives in Supabase, not just one browser's local storage

See [Not built yet](#not-built-yet-honest-roadmap) for what this *isn't* — job-board scanning and the interview story bank are designed for (the schema has room) but not implemented. Fit scoring beyond the CV/ATS dimension (role fit, level fit, comp fit, personalization) is also unimplemented — `job_matches` has columns for them, but only `cv_match_score` is currently computed.

For the product roadmap, market research, and phase-by-phase PRDs, see [docs/prds](docs/prds/README.md). For known product/engineering follow-up work, see [docs/tech-debt.md](docs/tech-debt.md).

## Architecture

```
Extension (Chrome, MV3)
├─ extension/popup.html + popup.js       — sign in/up, capture the current tab, last 3 captures, link to dashboard
├─ extension/dashboard.html + dashboard.js — full-page view: Jobs (list + detail), Resume, Settings
├─ extension/styles.css                  — shared design tokens/components used by both surfaces
└─ src/
   ├─ storage.js                         — chrome.storage.local wrapper (session + provider/model preference only)
   ├─ supabase-auth.js                   — email/password auth against Supabase's GoTrue REST API
   └─ supabase-db.js                     — PostgREST calls (jobs/resumes/applications) + calls the `tailor`/`extract-resume` Edge Functions

Supabase
├─ Postgres — resumes, profiles, jobs, applications, job_matches, interview_stories (RLS-scoped per user)
├─ Auth — email/password; the extension holds the resulting JWT
├─ Edge Function `tailor` — runs the LLM call server-side with the operator's own API key,
│  so no LLM key ever lives in the browser. Enforces a model allowlist, a per-job debounce,
│  a per-user hourly cap before spending on a call, and also computes the ATS match score
│  (stored in `job_matches`) as part of the same call.
└─ Edge Function `extract-resume` — PDF → plain text, always via Anthropic (native PDF
   document support) regardless of the tailoring provider you've selected — this is a
   one-time, low-volume utility call, not something that needs per-provider parity.
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
- A Supabase project, and API keys for whichever LLM provider(s) you want to enable

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

4. **Set the operator's LLM key(s) as Edge Function secrets.** `ANTHROPIC_API_KEY` is required regardless of your provider choice — it also powers PDF resume extraction. Add the others only if you want those provider options live in Settings for tailoring.
   ```
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   supabase secrets set OPENAI_API_KEY=sk-...      # optional, tailoring only
   supabase secrets set GEMINI_API_KEY=...          # optional, tailoring only
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
4. In the **Jobs** tab, select the captured job and click **Tailor resume + cover letter**.
5. Track status per job (`saved`/`applied`/`interviewing`/`offer`/`rejected`) from the detail panel.

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

- **API keys never reach the browser.** The `tailor` Edge Function holds the operator's LLM keys as secrets; the client only ever sends a provider/model *preference*.
- **RLS on every table**, scoped to `auth.uid()` — the actual isolation boundary between users, not just UI filtering.
- **Abuse guards on `tailor`**: a per-provider model allowlist (arbitrary model strings are rejected), a 15-second per-job debounce, and a 20-calls/hour per-user cap, backed by a single `applications.last_tailored_at` column rather than a separate rate-limiting service.
- **No `innerHTML` with untrusted data.** Job titles/descriptions (from arbitrary web pages) and LLM output are rendered via `textContent`/`.value`, never string-interpolated into HTML. Job URLs are validated to `http(s)` before ever becoming a real link.
- **Invite-only signup.** Public self-registration is disabled (`enable_signup = false`) — this repo is public and `SUPABASE_URL`/the publishable key are visible in the source (by design, see below), so open signup would let anyone spend the operator's AI budget via `tailor`. New users are added via Supabase Dashboard → Authentication → Users → Invite.
- **`SUPABASE_URL`/`SUPABASE_ANON_KEY` are meant to be public.** They identify the project and are required in any client-side call — RLS, not key secrecy, is the actual boundary. The `service_role` key and every LLM API key are the real secrets, and those only ever exist as Edge Function secrets, never in this repo or the browser.

## Not built yet (honest roadmap)

The schema (`job_matches`, `interview_stories`, `profiles`) has room for these, but none are wired up:

- Job-board scanning / bulk discovery (currently: manual capture only, one job at a time)
- The rest of `job_matches`' scorecard — role fit, level fit, comp fit, personalization, and the legitimacy flag. Only `cv_match_score` (the ATS match) is computed today.
- Skill-based profile extraction from the resume (`profiles` table)
- Interview story bank (STAR+R)
- A Supabase preview branch for testing migrations before production — still manual today

## License

MIT. See [LICENSE](LICENSE).
