import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildOnboardingSteps, nextIncompleteOnboardingStep } from '../src/onboarding-utils.js';

test('onboarding completion is derived from the user’s actual workspace data', () => {
  const steps = buildOnboardingSteps({
    preferences: { target_titles: ['Product Manager'] },
    resume: { id: 'resume-1' },
    recommendations: [{ id: 'recommendation-1' }],
    jobs: [],
  });
  assert.deepEqual(steps.map((step) => step.complete), [true, true, true, false]);
  assert.equal(nextIncompleteOnboardingStep(steps).id, 'tracker');
});

test('a click alone cannot complete onboarding steps', () => {
  const steps = buildOnboardingSteps();
  assert.deepEqual(steps.map((step) => step.complete), [false, false, false, false]);
  assert.equal(nextIncompleteOnboardingStep(steps).id, 'preferences');
});
