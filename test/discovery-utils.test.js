import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDiscoveryRecommendation } from '../src/discovery-utils.js';

test('discovery recommendation explains an explicit target-title match', () => {
  const recommendation = buildDiscoveryRecommendation({
    job: { title: 'Senior Product Manager', company: 'Acme', source_url: 'https://acme.test', jd_text: 'Product strategy and B2B SaaS. '.repeat(30) },
    preferences: { target_titles: ['Product Manager'], industries: ['SaaS'] },
  });
  assert.equal(recommendation.recommendation_label, 'strong_match');
  assert.ok(recommendation.reasoning.reasons.some((reason) => reason.includes('target title')));
});

test('excluded companies are hidden rather than recommended', () => {
  const recommendation = buildDiscoveryRecommendation({ job: { company: 'No Thanks', source_url: 'https://x.test' }, preferences: { excluded_companies: ['No Thanks'] } });
  assert.equal(recommendation.recommendation_label, 'hidden');
});

test('freshness reflects how long ago the posting was first seen, not the time of this call', () => {
  const freshPosting = buildDiscoveryRecommendation({ job: { source_url: 'https://x.test', first_seen_at: new Date().toISOString() } });
  assert.equal(freshPosting.reasoning.freshness_score, 100);

  const stalePosting = buildDiscoveryRecommendation({
    job: { source_url: 'https://x.test', first_seen_at: new Date(Date.now() - 30 * 86400000).toISOString() },
  });
  assert.equal(stalePosting.reasoning.freshness_score, 35);

  // A brand-new import (no discovered_jobs row yet) has no first_seen_at at
  // all — that's still fresh, not a fallback to some other stale reading.
  const neverSeen = buildDiscoveryRecommendation({ job: { source_url: 'https://x.test' } });
  assert.equal(neverSeen.reasoning.freshness_score, 100);
});

test('connector provenance and snippet warning are included in recommendation reasoning', () => {
  const recommendation = buildDiscoveryRecommendation({
    job: { source_url: 'https://example.test/job', source: 'adzuna', source_query: 'Product Manager remote', description_is_snippet: true, jd_text: 'Product strategy analytics roadmap delivery'.repeat(20) },
    preferences: { target_titles: ['Product Manager'] },
    resumeText: 'Product manager with analytics and roadmap delivery experience.',
  });
  assert.ok(recommendation.reasoning.reasons.some((reason) => reason.includes('Adzuna')));
  assert.ok(recommendation.reasoning.reasons.some((reason) => reason.includes('Search query')));
  assert.ok(recommendation.reasoning.reasons.some((reason) => reason.includes('snippet')));
  assert.match(recommendation.reasoning.ats_simulation, /ATS keyword simulation/);
});
