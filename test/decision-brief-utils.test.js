import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApplicationDecisionBrief } from '../src/decision-brief-utils.js';

test('decision brief composes existing scorecard, ATS, and health signals without a new score', () => {
  const brief = buildApplicationDecisionBrief({
    job: { title: 'Product Manager', company: 'Acme', location: 'Remote', jd_text: 'x'.repeat(400), posting_status: 'active', posting_check_reason: 'The public posting page responded successfully.' },
    scorecard: {
      overall_score: 82, recommendation: 'apply_now', confidence: 'high',
      factors: [
        { key: 'seniority_fit', label: 'Role and seniority fit', score: 100, explanation: 'Title matches your saved targets.' },
        { key: 'location_fit', label: 'Location and remote fit', score: 100, explanation: 'Compared with your saved work-location preference.' },
      ],
    },
    atsSimulation: {
      status: 'ready', overall_score: 88, confidence: 'high', matched_required: ['Product strategy'], missing_required: [], gates: [],
    },
  });
  assert.equal(brief.headline, 'Apply now · 82/100 · high confidence');
  assert.match(brief.evidence[1].text, /Product strategy/);
  assert.equal(brief.health[0].label, 'Active');
  assert.equal(brief.next_action.label, 'Apply now');
  assert.equal(brief.next_action.text.includes('application packet'), true);
});

test('decision brief prioritizes an expired posting and does not claim missing evidence is a gap', () => {
  const brief = buildApplicationDecisionBrief({
    job: { title: 'Engineer', posting_status: 'likely_expired', jd_text: 'short' },
    atsSimulation: { status: 'needs_review', overall_score: 55, confidence: 'low', matched_required: [], missing_required: [], gates: [] },
  });
  assert.equal(brief.next_action.label, 'Confirm before tailoring');
  assert.equal(brief.gaps[0].text, 'No required-skill gaps were detected.');
  assert.match(brief.role[2].text, /thin/);
});

test('decision brief surfaces an unresolved work-authorization gate as a risk', () => {
  const brief = buildApplicationDecisionBrief({
    job: { title: 'Engineer', jd_text: 'x'.repeat(400) },
    atsSimulation: {
      status: 'needs_review', overall_score: 70, confidence: 'medium', matched_required: [], missing_required: [],
      gates: [{ key: 'work_authorization', label: 'Work authorization', status: 'unknown', explanation: 'The posting mentions authorization or sponsorship; confirm your eligibility before applying.' }],
    },
  });
  assert.ok(brief.gaps.some((item) => item.label === 'Work authorization'));
});
