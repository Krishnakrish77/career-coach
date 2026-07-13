import { assessJobQuality } from './opportunity-utils.js';

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
  const ageDays = job.last_seen_at ? Math.max(0, (Date.now() - new Date(job.last_seen_at).getTime()) / 86400000) : 0;
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
  return { preference_fit_score: preferenceFit, resume_fit_score: resumeFit, job_quality_score: quality.score, recommendation_label: label, reasoning: { reasons, concerns: quality.concerns, quality, freshness_score: freshness } };
}
