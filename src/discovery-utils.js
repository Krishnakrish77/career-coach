import { assessJobQuality } from './opportunity-utils.js';
import { atsSimulationSummary } from './find-jobs-utils.js';

function includes(value, candidates) {
  const text = (value || '').toLowerCase();
  return (candidates || []).some((candidate) => text.includes(String(candidate).toLowerCase()));
}

export function buildDiscoveryRecommendation({ job = {}, preferences = {}, likedCount = 0, resumeText = '' } = {}) {
  const quality = assessJobQuality({ ...job, url: job.source_url });
  const titleMatch = includes(job.title, [...(preferences.target_titles || []), ...(preferences.title_aliases || [])]);
  const industryMatch = includes(job.jd_text, preferences.industries);
  const excluded = includes(job.company, preferences.excluded_companies);
  const preferenceFit = excluded ? 0 : Math.min(100, 35 + (titleMatch ? 45 : 0) + (industryMatch ? 20 : 0));
  const resumeWords = new Set((resumeText.toLowerCase().match(/[a-z]{3,}/g) || []));
  const jobWords = new Set(((job.jd_text || '').toLowerCase().match(/[a-z]{3,}/g) || []));
  const overlap = [...jobWords].filter((word) => resumeWords.has(word)).length;
  const resumeFit = resumeWords.size ? Math.min(100, overlap * 4) : null;
  // first_seen_at (not last_seen_at) — that's when this posting was first
  // captured, so re-imports of a stale repost still read as stale rather
  // than resetting to "fresh" just because it was touched again today.
  const ageDays = job.first_seen_at ? Math.max(0, (Date.now() - new Date(job.first_seen_at).getTime()) / 86400000) : 0;
  const freshness = ageDays <= 3 ? 100 : ageDays <= 14 ? 70 : 35;
  const reasons = [];
  if (titleMatch) reasons.push('Matches a target title or alias.');
  if (industryMatch) reasons.push('Matches one of your target industries.');
  if (!reasons.length) reasons.push('Add target titles or industries to improve personalization.');
  if (likedCount >= 3) reasons.push('You have enough liked roles for preference learning to begin.');
  const label = excluded ? 'hidden' : quality.redFlag ? 'low_priority'
    : preferenceFit >= 75 && quality.score >= 60 ? 'strong_match'
      : likedCount >= 3 ? 'like_based'
        : preferences.target_titles?.length ? 'worth_reviewing' : 'needs_preference_review';
  if (resumeFit != null) reasons.push(`Resume overlap: ${resumeFit}/100.`);
  if (job.source) reasons.push(`Source: ${job.source === 'usajobs' ? 'USAJOBS' : job.source === 'adzuna' ? 'Adzuna' : job.source}.`);
  if (job.source_query) reasons.push(`Search query: ${job.source_query}.`);
  const atsSummary = atsSimulationSummary(resumeText, job.jd_text || '');
  if (atsSummary) reasons.push(atsSummary);
  if (job.description_is_snippet) reasons.push('The source provided only a description snippet; verify details on the original posting.');
  return { preference_fit_score: preferenceFit, resume_fit_score: resumeFit, job_quality_score: quality.score, recommendation_label: label, reasoning: { reasons, concerns: quality.concerns, quality, freshness_score: freshness, source: job.source || null, source_query: job.source_query || null, ats_simulation: atsSummary, description_is_snippet: Boolean(job.description_is_snippet) } };
}
