// Explainable, deterministic PRD 2 triage. These are deliberately conservative:
// absent data lowers confidence instead of inventing a negative signal.

const REQUIRED_RE = /\b(required|must have|minimum qualifications?|basic qualifications?)\b/i;
const REMOTE_RE = /\b(remote|work from home|distributed)\b/i;
const HYBRID_RE = /\bhybrid\b/i;
const ONSITE_RE = /\b(on[ -]?site|in[- ]office)\b/i;
const AUTH_RE = /\b(authorized to work|work authorization|visa sponsorship|sponsorship|citizen(?:ship)?|security clearance)\b/i;
const COMP_RE = /(?:\$|₹|£|€)\s?\d[\d,]*(?:\s*(?:-|to)\s*(?:\$|₹|£|€)?\s?\d[\d,]*)?(?:\s*\/?\s*(?:year|yr|hour|hr))?/i;

function words(value) {
  return new Set((value || '').toLowerCase().match(/[a-z][a-z+#.-]{1,}/g) || []);
}

function clamp(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function includesAny(text, values) {
  const haystack = (text || '').toLowerCase();
  return (values || []).some((value) => value && haystack.includes(String(value).toLowerCase()));
}

export function assessJobQuality(job = {}) {
  const text = job.jd_text || '';
  const concerns = [];
  const positives = [];
  let score = 100;

  if (!job.company?.trim()) {
    score -= 20;
    concerns.push('Company identity is missing from this capture.');
  } else positives.push('Company identity was captured.');
  if (text.trim().length < 300) {
    score -= 25;
    concerns.push('Description is too short to assess reliably.');
  }
  if (/\b(whatsapp|telegram|crypto payment|wire transfer|pay.*(?:equipment|training))\b/i.test(text)) {
    score -= 35;
    concerns.push('Posting contains language commonly associated with job scams.');
  }
  if (!COMP_RE.test(text)) concerns.push('No compensation range was found.');
  if (/\b(?:10\+?|15\+?) years?\b/i.test(text) && /\b(junior|entry.?level|intern)\b/i.test(text)) {
    score -= 20;
    concerns.push('Experience requirements appear inconsistent with the stated level.');
  }
  if (job.url && !/^https:\/\//i.test(job.url)) {
    score -= 10;
    concerns.push('Application URL is not HTTPS.');
  }
  if (text.length >= 800) positives.push('Description contains enough detail for a useful review.');

  return { score: clamp(score), confidence: text.length >= 300 ? 'medium' : 'low', positives, concerns };
}

export function buildOpportunityScorecard({ job = {}, match = {}, preferences = {} } = {}) {
  const text = job.jd_text || '';
  const quality = assessJobQuality(job);
  const factors = [];
  const add = (key, label, score, confidence, explanation) => factors.push({ key, label, score: clamp(score), confidence, explanation });

  const ats = Number(match.cv_match_score);
  add('resume_match', 'Resume match', Number.isFinite(ats) ? ats : 50, Number.isFinite(ats) ? 'medium' : 'low',
    Number.isFinite(ats) ? 'Based on the current resume match assessment.' : 'Tailor or score this job to calculate a resume match.');
  const requiredSkills = (match.missing_skills || []).length;
  add('must_have_skills', 'Must-have skills', clamp(100 - requiredSkills * 15), requiredSkills ? 'medium' : 'low',
    requiredSkills ? `${requiredSkills} skill${requiredSkills === 1 ? '' : 's'} appears missing from the current resume.` : 'No confirmed required-skill gaps are available yet.');

  const targetTitles = preferences.target_titles || [];
  const titleFit = targetTitles.length ? (includesAny(job.title, targetTitles) ? 100 : 45) : 60;
  add('seniority_fit', 'Role and seniority fit', titleFit, targetTitles.length ? 'medium' : 'low',
    targetTitles.length ? (titleFit === 100 ? 'Title matches one of your targets.' : 'Title does not directly match your saved targets.') : 'Add target titles to personalize this factor.');

  const remotePreference = preferences.remote_preference;
  let locationScore = 60;
  if (remotePreference) {
    locationScore = remotePreference === 'remote' ? (REMOTE_RE.test(text) ? 100 : (ONSITE_RE.test(text) ? 20 : 55))
      : remotePreference === 'onsite' ? (ONSITE_RE.test(text) ? 100 : 55)
        : HYBRID_RE.test(text) ? 100 : 55;
  }
  add('location_fit', 'Location and remote fit', locationScore, remotePreference ? 'medium' : 'low',
    remotePreference ? 'Compared with your saved work-location preference.' : 'Add a work-location preference to personalize this factor.');

  const authRisk = AUTH_RE.test(text) && !preferences.work_authorization ? 35 : 80;
  add('work_authorization', 'Work authorization', authRisk, AUTH_RE.test(text) ? 'medium' : 'low',
    AUTH_RE.test(text) ? (preferences.work_authorization ? 'Posting mentions authorization; compare its details before applying.' : 'Posting mentions authorization and no preference is saved.') : 'No explicit authorization requirement was detected.');

  add('compensation_fit', 'Compensation fit', COMP_RE.test(text) ? 70 : 50, COMP_RE.test(text) ? 'low' : 'low',
    COMP_RE.test(text) ? 'A compensation range was detected; verify it against your floor.' : 'No usable compensation range was found.');
  add('job_quality', 'Job quality', quality.score, quality.confidence, quality.concerns[0] || quality.positives[0] || 'No strong quality signals were found.');

  const weighted = factors.reduce((total, factor) => total + factor.score, 0) / factors.length;
  const lowConfidence = factors.filter((factor) => factor.confidence === 'low').length;
  const isExcludedCompany = includesAny(job.company, preferences.excluded_companies);
  let recommendation = 'needs_review';
  if (isExcludedCompany || quality.score < 45) recommendation = 'skip';
  else if (lowConfidence >= 4) recommendation = 'needs_review';
  else if (weighted >= 75) recommendation = 'apply_now';
  else if (weighted >= 60) recommendation = 'tailor_first';
  else if (weighted >= 45) recommendation = 'network_first';
  else recommendation = 'maybe_later';
  const confidence = lowConfidence >= 4 ? 'low' : lowConfidence >= 2 ? 'medium' : 'high';

  return { factors, quality, overall_score: clamp(weighted), recommendation, confidence };
}

export function recommendationLabel(recommendation) {
  return ({ apply_now: 'Apply now', tailor_first: 'Tailor first', network_first: 'Network first', maybe_later: 'Maybe later', skip: 'Skip', needs_review: 'Needs review' })[recommendation] || 'Needs review';
}
