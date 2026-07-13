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
