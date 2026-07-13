import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCoachingPlan, weekStart } from '../src/coaching-utils.js';

test('coaching plan prioritizes overdue follow-ups before new volume', () => {
  const plan = buildCoachingPlan({ jobs: [{ applications: [{ status: 'applied', next_follow_up_at: '2020-01-01T00:00:00Z' }] }] });
  assert.ok(plan.items.some((item) => item.item_type === 'follow_up'));
  assert.equal(weekStart(new Date('2026-07-13T12:00:00Z')), '2026-07-13');
});
