<p align="center">
  <img src="icons/logo.png" alt="Career Coach" width="420">
</p>

# Career Coach

Career Coach is a Chrome extension for managing a job search in one place. Save roles while browsing, find new openings, assess fit, tailor application materials, and keep follow-ups and interview preparation organized.

## What you can do

- Save a job posting from the current browser tab.
- Find jobs from supported public sources, or add a public role manually.
- Set your target roles, locations, salary, and remote preference to improve recommendations.
- Store a resume, check its ATS readiness, and generate a tailored resume and cover letter for a saved role.
- Track each application from saved through offer or rejection, with notes and follow-up dates.
- Prepare interviews with a STAR story bank, practice prompts, and checklists.
- Plan the week around applications, follow-ups, and interview preparation.

## Install the extension

1. Download and unzip a [Career Coach release](../../releases), or clone this repository.
2. In Chrome, open `chrome://extensions`.
3. Turn on **Developer mode**.
4. Choose **Load unpacked** and select the unzipped project folder (the folder containing `manifest.json`).
5. Pin Career Coach from Chrome’s Extensions menu for quick access.

> A Chrome Web Store listing is not available yet, so Chrome’s “Load unpacked” flow is required.

## First-time setup

1. Open the Career Coach popup and sign in.
2. If you use the hosted instance, ask its administrator for an invitation first. Open the invitation email, set a password, then return to the popup to sign in.
3. Select **Open dashboard**.
4. Complete the short checklist at the top of the dashboard:
   - Add target job titles and preferred locations in **Settings**.
   - Paste your resume or upload a text-based PDF in **Resume**.
   - Choose **Find Jobs** in **Discovery**, or save a role from a browser tab.
   - Save a promising role to the tracker.

The checklist is optional and can be restarted from **Settings** at any time.

## Everyday workflow

1. **Capture:** Open a public job posting and choose **Save current tab** in the extension popup.
2. **Discover:** In the dashboard’s **Discovery** tab, choose **Find Jobs** for roles matching your saved preferences. It currently supports United States and India searches; a remote preference searches both markets.
3. **Decide:** Review the recommendation, source, freshness, fit, and quality signals. In a saved role, the **Application Decision** brief brings together fit evidence, gaps, preferences, and posting health before you tailor or apply.
4. **Apply:** In **Jobs**, use **Check Availability** before tailoring when a posting may be stale. Add confirmed career evidence and writing guidance in **Resume** if you want it considered in drafts. Review every generated draft before using it.
5. **Follow through:** Update the application status, add notes and a follow-up date, then use **Interview Prep** and **Weekly Plan** to stay organized.

## Troubleshooting

- **The extension is not visible:** Return to `chrome://extensions`, confirm Career Coach is enabled, then pin it from Chrome’s Extensions menu.
- **Sign-in link or password reset does not work:** Use the newest email from the configured Career Coach instance. Hosted accounts require an invitation.
- **Find Jobs shows no roles:** Check that target titles and a supported location or remote preference are saved in **Settings**. Results also depend on the public sources being available.
- **A PDF resume cannot be read:** Use a text-based PDF or paste the resume text. Scanned/image-only PDFs may need OCR before they can be used well.
- **A saved role is incomplete:** Open the role in **Jobs** and add the missing title, company, or description before tailoring.

## Run your own instance

This repository includes the extension and its Supabase backend. You need Node.js 18+, the Supabase CLI, a Supabase project, and credentials for any services you enable.

```sh
supabase login
supabase link --project-ref <your-project-ref>
supabase db push --password '<your-db-password>'
supabase secrets set ANTHROPIC_API_KEY=... \
  ADZUNA_APP_ID=... ADZUNA_APP_KEY=... \
  USAJOBS_API_KEY=... USAJOBS_USER_AGENT='Career Coach support@example.com'
supabase functions deploy tailor --use-api
supabase functions deploy extract-resume --use-api
supabase functions deploy find-jobs --use-api
supabase functions deploy check-job-health --use-api
```

Then update these project-specific values before loading the extension:

- `src/supabase-auth.js`: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `AUTH_LANDING_URL`
- `manifest.json`: the Supabase URL in `host_permissions`
- `supabase/config.toml`: the same auth landing URL in the auth redirect settings

`ANTHROPIC_API_KEY` enables tailoring. The Adzuna and USAJOBS credentials enable their respective Find Jobs sources; omit either source’s credentials to leave that source unavailable. Configure any additional tailoring provider only if you deliberately change the provider settings.

## Contributing

```sh
npm test
```

Tests use Node’s built-in test runner. For schema changes, create a migration with `supabase migration new <name>` and apply it with `supabase db push`. Deploy a changed Edge Function with `supabase functions deploy <function-name> --use-api`.

Product planning documents are in [docs/prds](docs/prds/README.md), and known follow-up work is in [docs/tech-debt.md](docs/tech-debt.md).

## License

MIT. See [LICENSE](LICENSE).
