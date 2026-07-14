import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatCareerContext } from '../src/career-evidence-utils.js';

test('only formats user-confirmed career evidence for tailoring context', () => {
  const context = formatCareerContext({
    evidence: [
      { title: 'Launch', evidence_text: 'Led a launch that improved activation by 12%.', skills: ['leadership'], review_status: 'user_confirmed' },
      { title: 'Draft', evidence_text: 'Unreviewed claim.', review_status: 'needs_review' },
    ],
    writingGuidance: { tone: 'Direct and warm', phrases_to_avoid: 'passionate self-starter' },
  });
  assert.equal(context.confirmedCount, 1);
  assert.match(context.evidenceText, /improved activation/);
  assert.doesNotMatch(context.evidenceText, /Unreviewed/);
  assert.match(context.guidanceText, /Direct and warm/);
});
