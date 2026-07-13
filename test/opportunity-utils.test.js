import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessJobQuality, buildOpportunityScorecard } from '../src/opportunity-utils.js';

test('quality heuristics flag short anonymous suspicious postings without asserting fraud', () => {
  const result = assessJobQuality({ url: 'http://example.test', jd_text: 'Pay crypto equipment fee on Telegram.' });
  assert.ok(result.score < 50);
  assert.ok(result.concerns.some((item) => item.includes('scams')));
});

test('scorecard uses saved preferences and maps strong evidence to apply now', () => {
  const card = buildOpportunityScorecard({
    job: { title: 'Senior Product Manager', company: 'Acme', url: 'https://acme.test/jobs/1', jd_text: 'Remote role. $150,000 - $180,000 per year. '.repeat(30) },
    match: { cv_match_score: 88, missing_skills: [] },
    preferences: { target_titles: ['Product Manager'], remote_preference: 'remote', work_authorization: 'US authorized' },
  });
  assert.equal(card.recommendation, 'apply_now');
  assert.equal(card.confidence, 'medium');
  assert.equal(card.factors.length, 7);
});

test('scorecard defaults uncertain inputs to needs review', () => {
  const card = buildOpportunityScorecard({ job: { title: 'Role', url: 'https://x.test', jd_text: 'Short description.' } });
  assert.equal(card.recommendation, 'needs_review');
  assert.equal(card.confidence, 'low');
});

test('an explicitly excluded company is always a skip recommendation', () => {
  const card = buildOpportunityScorecard({
    job: { title: 'Engineer', company: 'No Thanks Inc', url: 'https://x.test', jd_text: 'Remote role with a detailed description. '.repeat(30) },
    preferences: { excluded_companies: ['No Thanks Inc'] },
  });
  assert.equal(card.recommendation, 'skip');
});

test('missing/thin capture data alone never produces a skip, only lower confidence', () => {
  // No company captured, a short description, a plain http URL, and an
  // innocuous sentence that happens to trip the (now-fixed) experience-level
  // heuristic — none of this is actual evidence the posting is bad.
  const card = buildOpportunityScorecard({
    job: {
      title: 'Backend Engineer',
      company: '',
      url: 'http://acme.example.com/jobs/42',
      jd_text: 'Our team includes engineers with 10+ years of experience and we also run an intern program for students.',
    },
  });
  assert.notEqual(card.recommendation, 'skip');
});

test('scam phrase requires the actual scam pattern, not just nearby ordinary words', () => {
  const ordinary = assessJobQuality({
    company: 'Acme',
    jd_text: 'We are transparent about how we pay employees and the training programs available once hired. '.repeat(10),
  });
  assert.equal(ordinary.redFlag, false);
  assert.ok(!ordinary.concerns.some((item) => item.includes('scams')));

  const actualScam = assessJobQuality({ jd_text: 'You must pay for your own equipment before we can start onboarding.' });
  assert.equal(actualScam.redFlag, true);
});
