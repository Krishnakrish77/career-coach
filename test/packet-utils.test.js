import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPacketDrafts } from '../src/packet-utils.js';

test('packet drafts are grounded and mark missing personal evidence', () => {
  const drafts = createPacketDrafts({ job: { title: 'Designer', company: 'Acme' } });
  assert.equal(drafts.length, 5);
  assert.match(drafts.find((item) => item.item_type === 'recruiter_message').draft_content, /Designer/);
  assert.match(drafts.find((item) => item.item_type === 'short_answer').source_evidence, /Needs user input/);
});

test('packet drafts can seed a review-required answer from confirmed career evidence', () => {
  const drafts = createPacketDrafts({
    job: { title: 'Designer', company: 'Acme' },
    careerEvidence: [{ title: 'Design system', evidence_text: 'Built a component library used by four teams.', review_status: 'user_confirmed' }],
  });
  const answer = drafts.find((item) => item.item_type === 'short_answer');
  assert.match(answer.draft_content, /component library/);
  assert.match(answer.source_evidence, /User-confirmed/);
});
