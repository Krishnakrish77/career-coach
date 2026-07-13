import { assessJobQuality } from './opportunity-utils.js';

function includes(value, candidates) {
  const text = (value || '').toLowerCase();
  return (candidates || []).some((candidate) => text.includes(String(candidate).toLowerCase()));
}

export function buildDiscoveryRecommendation({ job = {}, preferences = {}, likedCount = 0 } = {}) {
  const quality = assessJobQuality({ ...job, url: job.source_url });
  const titleMatch = includes(job.title, [...(preferences.target_titles || []), ...(preferences.title_aliases || [])]);
  const industryMatch = includes(job.jd_text, preferences.industries);
  const excluded = includes(job.company, preferences.excluded_companies);
  const preferenceFit = excluded ? 0 : Math.min(100, 35 + (titleMatch ? 45 : 0) + (industryMatch ? 20 : 0));
  const reasons = [];
  if (titleMatch) reasons.push('Matches a target title or alias.');
  if (industryMatch) reasons.push('Matches one of your target industries.');
  if (!reasons.length) reasons.push('Add target titles or industries to improve personalization.');
  if (likedCount >= 3) reasons.push('You have enough liked roles for preference learning to begin.');
  const label = excluded ? 'hidden' : quality.redFlag ? 'low_priority'
    : preferenceFit >= 75 && quality.score >= 60 ? 'strong_match'
      : likedCount >= 3 ? 'like_based'
        : preferences.target_titles?.length ? 'worth_reviewing' : 'needs_preference_review';
  return { preference_fit_score: preferenceFit, job_quality_score: quality.score, recommendation_label: label, reasoning: { reasons, concerns: quality.concerns, quality } };
}
