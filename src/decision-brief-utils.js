import { atsStatusLabel } from './ats-utils.js';
import { healthStatusLabel } from './job-health-utils.js';
import { recommendationLabel } from './opportunity-utils.js';

function factor(scorecard, key) {
  return scorecard?.factors?.find((item) => item.key === key) || null;
}

function detail(label, text, tone = 'neutral') {
  return { label, text, tone };
}

// This is deliberately a composition layer, not another evaluator. It only
// summarizes the persisted opportunity scorecard and the existing ATS
// simulation so a user can make one informed, reviewable decision.
export function buildApplicationDecisionBrief({ job = {}, scorecard = null, atsSimulation = null } = {}) {
  const matched = atsSimulation?.matched_required || [];
  const missing = atsSimulation?.missing_required || [];
  const concerningGates = (atsSimulation?.gates || []).filter((gate) => ['block', 'warn', 'unknown'].includes(gate.status));
  const preferences = ['seniority_fit', 'location_fit', 'compensation_fit', 'work_authorization']
    .map((key) => factor(scorecard, key))
    .filter(Boolean)
    .map((item) => detail(item.label, item.explanation, item.score >= 70 ? 'positive' : item.score < 50 ? 'warning' : 'neutral'));

  const health = job.posting_status && job.posting_status !== 'unverified'
    ? detail(healthStatusLabel(job.posting_status), job.posting_check_reason || 'Availability was checked for this saved posting.', job.posting_status === 'active' ? 'positive' : 'warning')
    : detail('Not checked', 'Check availability before spending time tailoring a potentially stale posting.', 'neutral');

  let nextAction = detail('Assess opportunity', 'Run Opportunity Triage to personalize the recommendation from your saved preferences.', 'neutral');
  if (job.posting_status === 'likely_expired') {
    nextAction = detail('Confirm before tailoring', 'This posting appears expired. Open the source and confirm it is still accepting applications.', 'warning');
  } else if (atsSimulation?.status === 'blocked') {
    nextAction = detail('Resolve blocker', atsSimulation.resume_completeness?.status === 'block' ? 'Save a resume before tailoring this role.' : 'Review the blocking ATS checks before preparing an application.', 'warning');
  } else if (scorecard) {
    const actionCopy = {
      apply_now: 'Review the source, then create an application packet when you are ready to apply.',
      tailor_first: 'Tailor your materials, then review the remaining gaps before applying.',
      network_first: 'Research the team or reach out before deciding whether to apply.',
      maybe_later: 'Keep this role saved and revisit it when stronger evidence or preferences are available.',
      skip: 'Skip or archive this role unless there is context the scorecard cannot see.',
      needs_review: 'Review the listed gaps and preference signals before committing time to an application.',
    };
    nextAction = detail(recommendationLabel(scorecard.recommendation), actionCopy[scorecard.recommendation] || actionCopy.needs_review, scorecard.recommendation === 'skip' ? 'warning' : scorecard.recommendation === 'apply_now' ? 'positive' : 'neutral');
  }

  return {
    headline: scorecard
      ? `${recommendationLabel(scorecard.recommendation)} · ${scorecard.overall_score}/100 · ${scorecard.confidence} confidence`
      : 'Complete opportunity triage for a personalized recommendation.',
    role: [
      detail('Role', [job.title, job.company].filter(Boolean).join(' at ') || 'Title and company need review.'),
      detail('Location', job.location || 'Location was not captured.'),
      detail('Description', job.jd_text?.trim().length >= 300 ? 'Enough description text was captured for a useful review.' : 'The captured description is thin; verify requirements on the source page.', job.jd_text?.trim().length >= 300 ? 'positive' : 'warning'),
    ],
    evidence: atsSimulation
      ? [
        detail(`${atsStatusLabel(atsSimulation.status)} ATS simulation`, `${atsSimulation.overall_score}/100 · ${atsSimulation.confidence} confidence`, atsSimulation.status === 'ready' ? 'positive' : atsSimulation.status === 'blocked' ? 'warning' : 'neutral'),
        detail('Confirmed evidence', matched.length ? `Required terms found in the resume: ${matched.slice(0, 4).join(', ')}.` : 'No required-term evidence is confirmed yet.', matched.length ? 'positive' : 'neutral'),
      ]
      : [detail('Resume evidence', 'Save a resume to check evidence against this job description.', 'neutral')],
    gaps: [
      detail('Required-skill gaps', missing.length ? `Review: ${missing.slice(0, 4).join(', ')}.` : 'No required-skill gaps were detected.', missing.length ? 'warning' : 'positive'),
      ...concerningGates.slice(0, 2).map((gate) => detail(gate.label, gate.explanation, 'warning')),
    ],
    preferences: preferences.length ? preferences : [detail('Preference fit', 'Run Opportunity Triage to compare this role with your saved preferences.', 'neutral')],
    health: [health],
    next_action: nextAction,
  };
}
