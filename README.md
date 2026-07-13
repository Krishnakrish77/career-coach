<p align="center">
  <img src="icons/logo.png" alt="Career Coach" width="420">
</p>

Career Coach is a Chrome extension that helps you run a job search: capture postings as you browse, generate a tailored resume and cover letter per job, and track application status — backed by Supabase (Postgres + Auth + Edge Functions), not a server you have to run yourself.

## What it does today

- **Capture** — one click in the popup saves the current tab's job posting text
- **Tailor** — generates a tailored resume + cover letter per job via an LLM (Anthropic, OpenAI, or Gemini — your choice in Settings)
- **Track** — per-job application status (`saved` → `applied` → `interviewing` → `offer`/`rejected`)
- **Multi-device** — signed-in accounts, data lives in Supabase, not just one browser's local storage

See [Not built yet](#not-built-yet-honest-roadmap) for what this *isn't* — job-board scanning, fit scoring, and the interview story bank are designed for (the schema has room) but not implemented.

## Architecture

```
Extension (Chrome, MV3)
├─ extension/popup.html + popup.js       — sign in/up, capture the current tab, last 3 captures, link to dashboard
├─ extension/dashboard.html + dashboard.js — full-page view: Jobs (list + detail), Resume, Settings
├─ extension/styles.css                  — shared design tokens/components used by both surfaces
└─ src/
   ├─ storage.js                         — chrome.storage.local wrapper (session + provider/model preference only)
   ├─ supabase-auth.js                   — email/password auth against Supabase's GoTrue REST API
   └─ supabase-db.js                     — PostgREST calls (jobs/resumes/applications) + calls the `tailor` Edge Function

Supabase
├─ Postgres — resumes, profiles, jobs, applications, job_matches, interview_stories (RLS-scoped per user)
├─ Auth — email/password; the extension holds the resulting JWT
└─ Edge Function `tailor` — runs the LLM call server-side with the operator's own API key,
   so no LLM key ever lives in the browser. Enforces a model allowlist, a per-job debounce,
   and a per-user hourly cap before spending on a call.
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
  supabase-db.js              Data: listJobs/getJob/insertJob/updateApplicationStatus/
                               deleteJob/saveResume/getLatestResume/tailorJob
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

3. **Push the schema.** Applies the three migrations in `supabase/migrations/` (resumes/profiles/jobs/applications/job_matches/interview_stories tables, RLS policies, constraints, indexes).
   ```
   supabase db push --password '<your-db-password>'
   ```

4. **Set the operator's LLM key(s) as Edge Function secrets.** At least one is required for tailoring to work; add the others only if you want those provider options live in Settings.
   ```
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   supabase secrets set OPENAI_API_KEY=sk-...      # optional
   supabase secrets set GEMINI_API_KEY=...          # optional
   ```

5. **Deploy the Edge Function.**
   ```
   supabase functions deploy tailor --use-api
   ```
   (`--use-api` bundles server-side without needing Docker running locally.)

6. **Point the extension at your project.** Two places hardcode the project reference today (this is a single-deployment personal project, not yet parameterized for forks):
   - `src/supabase-auth.js` — `SUPABASE_URL` and `SUPABASE_ANON_KEY` (the **publishable** key — safe to embed client-side, RLS is the actual security boundary)
   - `manifest.json` — `host_permissions` must list your project's `https://<ref>.supabase.co/*`

7. **Load the extension.** `chrome://extensions` → enable Developer mode → "Load unpacked" → select this directory.

## Using it

1. Open the popup, sign up (email + password).
2. Browse to a job posting, click **Save current tab**.
3. Click **Open dashboard →**. In the **Resume** tab, paste your resume once.
4. In the **Jobs** tab, select the captured job and click **Tailor resume + cover letter**.
5. Track status per job (`saved`/`applied`/`interviewing`/`offer`/`rejected`) from the detail panel.

## Development

```
npm test          # runs every test/*.test.js via Node's built-in test runner — no Jest/Mocha/etc.
```

Tests mock `fetch` via dependency injection (every network function takes an optional `fetchImpl` parameter) rather than stubbing globals — see `test/supabase-auth.test.js` / `test/supabase-db.test.js` for the pattern.

To iterate on the Edge Function:
```
supabase functions deploy tailor --use-api   # after any change to supabase/functions/tailor/index.ts
```

To add a schema change: `supabase migration new <name>`, edit the generated SQL, then `supabase db push --password '...'`.

**One-time setup after cloning** — run the test suite locally on every push, so most failures never reach GitHub Actions:
```
git config core.hooksPath .githooks
```
(`core.hooksPath` is a local git setting, not something git syncs on clone — every clone needs to run this once.)

## CI / releases

- **CI** (`.github/workflows/ci.yml`) runs on PRs and pushes to `main` only — not every branch push, and not on docs/icon-only changes (`paths-ignore`). A new push to the same PR cancels the previous run in progress rather than letting a stale one finish. This is a backstop: the pre-push hook above should already catch most failures before they ever reach Actions.
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

## Not built yet (honest roadmap)

The schema (`job_matches`, `interview_stories`, `profiles`) has room for these, but none are wired up:

- Job-board scanning / bulk discovery (currently: manual capture only, one job at a time)
- Fit scoring (`job_matches` — role/CV/level/comp/personalization scorecard, legitimacy flag)
- Skill-based profile extraction from the resume
- Interview story bank (STAR+R)
- CI, a release/packaging workflow, and a Supabase preview branch for testing migrations before production — still manual today
