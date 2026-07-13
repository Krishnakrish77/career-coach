# Career Coach Product Roadmap PRDs

Last updated: 2026-07-13

These artifacts translate the product roadmap into implementation-ready PRDs for Career Coach, a Chrome extension that helps job seekers capture job postings, tailor materials, score match quality, and track applications.

## Product Thesis

Career Coach should become a job-search operating system for active job seekers: one place to decide which roles are worth pursuing, produce honest high-quality application materials, track progress, prepare for interviews, and improve the search week over week.

The product should not optimize for the highest number of applications. The market is already flooded with AI-generated applications, and job seekers are losing trust in job boards, opaque ATS systems, ghost postings, and AI-mediated interviews. Career Coach should optimize for better-fit applications, faster execution, clearer follow-up, and more interviews from fewer wasted attempts.

## Roadmap Sequence

| Phase | PRD | User value | Why this order |
| --- | --- | --- | --- |
| 0 | [Market Research and Product Strategy](00-market-research-and-product-strategy.md) | Aligns roadmap to real job-seeker pain and competitive context. | Defines the product bets before implementation. |
| 1 | [Reliable Application Workspace](01-reliable-application-workspace.md) | Makes the current capture, resume, tailoring, scoring, and tracking loop dependable. | Reliability is the base layer for every later feature. |
| 2 | [Opportunity Triage and Job Quality](02-opportunity-triage-and-job-quality.md) | Helps users choose the jobs most worth their time and avoid low-quality or suspicious postings. | Users need prioritization before more automation. |
| 3 | [Job Discovery and Preference Learning](06-job-discovery-and-preference-learning.md) | Finds better candidate jobs and learns from roles the user likes, saves, skips, and applies to. | Discovery should use triage and preferences before application automation scales. |
| 4 | [Application Packet and Assisted Apply](03-application-packet-and-assisted-apply.md) | Turns a saved job into a complete, reviewable application packet with export and assisted form fill. | Builds on reliable job and resume data to reduce execution time. |
| 5 | [Interview Acceleration](04-interview-acceleration.md) | Converts applications into interview readiness through story banking, role-specific prep, and practice. | The product needs to improve outcomes after application submission, not stop at documents. |
| 6 | [Guided Search Coach](05-guided-search-coach.md) | Creates a weekly search plan, feedback loop, and sustainable operating cadence for users. | Uses accumulated job, application, and outcome data to guide behavior. |

## Strategic Bets

1. **Quality beats volume.** Winning users will not be the ones submitting the most generic applications. They will be the ones applying to better-fit roles with credible, targeted materials and follow-up.
2. **Decision support is the wedge.** Resume tailoring is crowded. Career Coach can differentiate by helping users decide whether a posting is worth applying to before spending effort.
3. **Browser-native context matters.** The extension already observes the job page at the point of intent. That creates an advantage over generic resume builders if the workflow is fast and trustworthy.
4. **Trust is a product feature.** The product should explain recommendations, avoid fabricating experience, never auto-submit applications, and keep users in control.
5. **Preference learning should stay explicit.** The product should learn from jobs users like, save, skip, and apply to, but it must show why those signals affect future recommendations.
6. **Interview conversion is the real outcome.** Application counts are activity metrics. The roadmap should optimize application-to-interview conversion and qualified pipeline movement.

## North Star And Supporting Metrics

North Star: **Qualified applications submitted per active user per week.**

A qualified application means:

- The user chose to pursue the role after reviewing fit and quality signals.
- The application packet was tailored to the posting without fabricated experience.
- The job moved from saved to applied, networking, interview, offer, or rejected with a tracked next step.

Supporting metrics:

- Job capture success rate.
- Resume setup completion rate.
- Time from job capture to ready-to-submit packet.
- Percentage of saved jobs reviewed with match and quality signals.
- Percentage of saved jobs moved to applied, networking, or intentional skip.
- Percentage of recommended jobs accepted, saved, or liked by users.
- Application-to-interview conversion rate.
- Follow-up completion rate.
- User-reported job search confidence and control.

## Product Principles

- Keep the user in control.
- Explain scoring and recommendations in plain language.
- Never fabricate qualifications, employers, education, credentials, metrics, or work authorization.
- Never auto-submit job applications.
- Prefer fewer better actions over more low-quality actions.
- Treat privacy and data minimization as part of the core UX.
- Make the product useful for stressed, time-constrained users, not only power users.

## Source Base

The market brief uses sources from BLS, MarketWatch, AP, Business Insider, The Guardian, arXiv research papers, and public product pages for Teal, Huntr, Simplify, Jobscan, and Career.io. See [Market Research and Product Strategy](00-market-research-and-product-strategy.md#sources) for the full list.
