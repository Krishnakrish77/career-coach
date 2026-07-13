# Market Research And Product Strategy

Status: Draft
Owner: Product
Last updated: 2026-07-13
Related PRDs: [1](01-reliable-application-workspace.md), [2](02-opportunity-triage-and-job-quality.md), [3](03-application-packet-and-assisted-apply.md), [4](04-interview-acceleration.md), [5](05-guided-search-coach.md)

## Executive Summary

The job-search market is not short on resume builders or application automation. It is short on trustworthy, end-to-end decision support for job seekers who are tired, uncertain, and applying in a market where openings exist but hiring remains slow.

Career Coach should not compete as another generic resume generator. Its strongest position is a browser-native command center that helps users:

- Capture jobs at the moment they discover them.
- Decide whether each role is worth pursuing.
- Create an honest, tailored application packet.
- Track follow-up and outcomes.
- Prepare for interviews with role-specific evidence.
- Learn from conversion data and adjust their search strategy.

The product should reduce wasted effort and increase interview conversion, not simply increase application volume.

## Market Signals

### Hiring Is Slow Even When Openings Exist

The June 2026 BLS Employment Situation reported nonfarm payroll employment up by 57,000 and unemployment at 4.2 percent, with long-term unemployed people representing 27.3 percent of all unemployed people. MarketWatch and AP both describe the environment as "low-hire, low-fire": layoffs remain contained, but new opportunities are harder to land.

Product implication: users need help prioritizing the right jobs and maintaining a disciplined pipeline. A tracker alone is not enough.

### Job Seekers Face Application Inflation

AI has made it cheap to generate and submit many resumes. Reporting on LinkedIn application volume described a market where AI-generated applications flood job boards. Business Insider's coverage of Huntr also emphasizes application-to-interview conversion as a better success metric than raw application count.

Product implication: Career Coach should avoid "apply to everything" mechanics. The UI should make quality, fit, and follow-up more visible than volume.

### Ghost Jobs And Low-Quality Postings Waste Candidate Time

Research on ghost jobs estimates that up to 21 percent of postings may not represent roles actively intended to be filled. WSJ coverage citing Greenhouse described fake or never-filled postings as a meaningful job-seeker problem. Job seekers need signals that help them decide whether a posting deserves time.

Product implication: job quality scoring should be part of the core product, not a later nice-to-have.

### AI Is Moving Into Interviews And Screening

Business Insider reported that AI-led interviews are expanding into white-collar roles, and cited Greenhouse data showing many candidates have opted out of AI-involved hiring processes. The Guardian reported Greenhouse survey data showing that AI interviews are common enough to shape candidate experience and abandonment.

Product implication: interview prep cannot be generic. Users need to practice concise evidence-backed answers, understand AI interview formats, and retain agency when they choose whether to continue a process.

### AI Skills Are Becoming Mainstream

Business Insider's summary of Indeed Hiring Lab analysis reported that AI-referenced job titles grew meaningfully from 2022 to Q1 2026, with most AI-touched roles outside traditional tech. This does not mean every user must become an AI engineer, but it does mean job seekers need better alignment between role requirements and credible skills.

Product implication: skill-gap recommendations and honest positioning should become part of fit scoring and weekly coaching.

### Resume Tailoring Needs Provenance

Recent resume-tailoring research argues that longitudinal career context and provenance can improve tailoring when relevant experience exists, but can harm fit when domain overlap is weak. This is a strong warning against ungrounded resume generation.

Product implication: generated bullets and cover-letter claims should be traceable to the user's resume, story bank, or user-approved career facts.

## Competitive Landscape

| Category | Examples | What they do well | Gap Career Coach can exploit |
| --- | --- | --- | --- |
| Job-search command centers | Teal, Huntr, Career.io | Combine resume tools, trackers, Chrome capture, cover letters, and interview tools. | Often optimize for broad feature coverage. Career Coach can focus on trust, explainability, self-hostability, and better job-quality decisions. |
| ATS and resume scanners | Jobscan, Resume Worded-style tools | Provide resume-to-job keyword analysis and resume feedback. | Scoring can become a shallow game. Career Coach should combine match score with evidence, missing skills, job quality, and recommended action. |
| Application autofill | Simplify Copilot, Huntr autofill | Reduce repetitive form entry. | Autofill without application judgment can increase low-quality volume. Career Coach should require packet review and never auto-submit. |
| Job boards and AI search | LinkedIn, Indeed, Google Jobs | Discovery scale and search distribution. | Discovery is crowded. Career Coach can win after discovery: capture, triage, tailoring, tracking, prep, and feedback loops. |
| Human career coaching | Coaches, outplacement, bootcamp support | High trust and context when affordable. | Expensive and hard to scale. Career Coach can offer structured self-service support and leave room for coach export later. |

## Target Users

Primary user: active job seeker applying to 10-50 roles per week.

Characteristics:

- Recently laid off, career switching, graduating, or trying to move roles in a slower market.
- Uses LinkedIn, Indeed, company career pages, and niche boards.
- Already has a resume but is unsure how well it matches each job.
- Tracks work in a spreadsheet, notes app, email, or memory.
- Wants faster execution without feeling dishonest or spammy.

Secondary users:

- Career coaches who want a structured tool to recommend to clients.
- Bootcamp or workforce-development programs that need students to manage search quality.
- Self-hosting/privacy-conscious users who do not want all job-search data in a closed SaaS platform.

## Jobs To Be Done

1. When I find a job that looks interesting, I want to save it quickly with the right details so I do not lose track of it.
2. When I have many possible jobs, I want to know which ones are worth applying to first so I do not waste limited energy.
3. When I apply, I want credible tailored materials that reflect my actual experience so I can stand out without misrepresenting myself.
4. When I submit an application, I want reminders and next steps so opportunities do not decay silently.
5. When I get an interview, I want role-specific practice using my real stories so I can answer clearly under pressure.
6. When my search is not working, I want to know whether the issue is targeting, resume quality, application execution, or interview performance.

## Product Positioning

Recommended positioning:

> Career Coach helps job seekers apply with focus: save roles, score fit, avoid wasted applications, tailor honest materials, track follow-up, and prepare for interviews from one browser-native workspace.

Avoid these positions:

- "Beat the ATS."
- "Apply to hundreds of jobs automatically."
- "Let AI run your job search."
- "Guarantee interviews."

## Differentiation

Career Coach can differentiate on:

- **Decision quality:** fit and job-quality triage before packet generation.
- **Trust:** explainable scoring, grounded suggestions, no fabricated claims.
- **Workflow locality:** capture from the browser, use the page context immediately, and return to the page for assisted apply.
- **Privacy posture:** open source, self-hostable architecture, RLS, no client-side LLM keys.
- **Outcome loop:** measure interview conversion and recommend pivots.

## Opportunity Map

| Opportunity | User value | Product bet |
| --- | --- | --- |
| Reliable application workspace | Fewer lost jobs, fewer duplicate entries, less mental load. | Make capture, resume setup, ATS score, tailoring, and tracking durable. |
| Opportunity triage | Less wasted time on poor-fit, stale, risky, or low-return postings. | Add fit and job-quality scorecards before application effort. |
| Application packet | Faster submission without lowering quality. | Generate reviewable, exportable, source-backed packets. |
| Assisted apply | Less repetitive form entry. | Autofill only after user review; never auto-submit. |
| Interview acceleration | Better conversion after application. | Build a story bank and role-specific interview prep. |
| Guided search coach | Better strategy over weeks, not just per job. | Use conversion data to recommend weekly focus and pivots. |

## Metrics

North Star: qualified applications submitted per active user per week.

Primary outcome metrics:

- Application-to-interview conversion rate.
- Time from captured job to ready application packet.
- Percentage of saved jobs that receive an intentional action: apply, network, skip, archive, or follow up.
- Percentage of applications with a tracked next step.
- Interview prep completion rate for jobs that enter interviewing.

Guardrail metrics:

- Percentage of generated claims edited or rejected by users.
- User reports of fabricated or unsupported content.
- Unintentional form-fill incidents.
- Tailor failure rate and Edge Function cost per active user.
- User-reported overwhelm or trust drop.

## Roadmap Logic

1. First make the current workflow reliable enough that a user can trust it every day.
2. Then add decision support so users apply to better jobs, not just more jobs.
3. Then reduce application execution time with packets and assisted apply.
4. Then help users win interviews after they get callbacks.
5. Finally, add weekly planning and feedback once the product has enough behavioral data.

## Key Risks

- Users may interpret scores as deterministic truth rather than directional guidance.
- Job-quality scoring can produce false positives and false negatives.
- Resume generation may hallucinate achievements without strict grounding.
- Autofill can become risky if it writes to wrong fields or submits without consent.
- Too much guidance can feel patronizing during a stressful job search.
- A polished roadmap can overreach current engineering capacity.

## Open Research Questions

- Which user segment gets the highest immediate value: laid-off tech workers, early-career professionals, career switchers, or general white-collar job seekers?
- What is the minimum viable job-quality score that users trust?
- Does a match score drive better decisions, or does it create score-chasing behavior?
- Which export formats matter first: clipboard, PDF, DOCX, plain text, or Google Docs?
- What level of weekly coaching feels supportive rather than nagging?

## Sources

- BLS Employment Situation Summary, June 2026: https://www.bls.gov/news.release/empsit.nr0.htm
- MarketWatch, low-hire low-fire job seeker conditions, July 2026: https://www.marketwatch.com/story/day-to-day-dread-haunts-frustrated-job-seekers-in-era-of-low-hiring-when-will-it-end-76640caf
- AP, June 2026 hiring slowdown: https://apnews.com/article/49c7a993b394e6ae3f801c8e3c0d39dd
- Times of India, secondary reporting on LinkedIn application volume and AI-generated resumes: https://timesofindia.indiatimes.com/education/news/automated-resumes-flood-us-job-market-as-ai-drives-11000-applications-per-minute/articleshow/122112552.cms
- Business Insider, Huntr job-search advice and application-to-interview conversion framing: https://www.businessinsider.com/ai-resume-builder-shares-top-tips-for-todays-job-market-2026-1
- Business Insider, AI-touched job titles and Indeed Hiring Lab analysis, July 2026: https://www.businessinsider.com/job-postings-ai-demand-hiring-opportunities-2026-7
- Business Insider, AI-led interviews and Greenhouse survey, July 2026: https://www.businessinsider.com/ai-bot-job-interview-white-collar-work-2026-7
- The Guardian, Greenhouse AI interview survey, May 2026: https://www.theguardian.com/technology/2026/may/01/uk-job-hunters-frustration-ai-interviews
- WSJ, fake and ghost job postings citing Greenhouse: https://www.wsj.com/lifestyle/careers/ghost-jobs-2c0dcd4e
- arXiv, "Why is it so hard to find a job now? Enter Ghost Jobs": https://arxiv.org/abs/2410.21771
- arXiv, career-aware resume tailoring with provenance: https://arxiv.org/abs/2605.05257
- arXiv, semantic search at LinkedIn: https://arxiv.org/abs/2602.07309
- Teal product site: https://www.tealhq.com/
- Huntr product site: https://huntr.co/
- Simplify Copilot product site: https://simplify.jobs/copilot
- Jobscan product site: https://www.jobscan.co/
- Career.io review and market overview: https://nypost.com/shopping/career-io-review/
