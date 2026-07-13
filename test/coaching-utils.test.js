import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCoachingPlan, weekStart } from '../src/coaching-utils.js';

test('coaching plan prioritizes overdue follow-ups before new volume', () => {
  const plan = buildCoachingPlan({ jobs: [{ applications: [{ status: 'applied', next_follow_up_at: '2020-01-01T00:00:00Z' }] }] });
  assert.ok(plan.items.some((item) => item.item_type === 'follow_up'));
  assert.equal(weekStart(new Date('2026-07-13T12:00:00Z')), '2026-07-13');
});

test('by_title analytics keeps titles with real signal over merely-recent zero-signal ones', () => {
  // Five just-saved (zero-signal) titles appear first in the list, then one
  // title with real applied activity appears last — it must not be dropped
  // by a naive "first 5" truncation.
  const zeroSignalJobs = Array.from({ length: 5 }, (_, i) => ({ title: `Untouched Role ${i}`, applications: [{ status: 'saved' }] }));
  const signalJob = { title: 'Backend Engineer', applications: [{ status: 'applied' }] };
  const plan = buildCoachingPlan({ jobs: [...zeroSignalJobs, signalJob] });

  assert.ok(plan.analytics.by_title.some((bucket) => bucket.title === 'Backend Engineer'));
  assert.ok(plan.analytics.by_title.every((bucket) => bucket.applied + bucket.interviewing > 0));
});
