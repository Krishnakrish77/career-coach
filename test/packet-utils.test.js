import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPacketDrafts } from '../src/packet-utils.js';

test('packet drafts are grounded and mark missing personal evidence', () => {
  const drafts = createPacketDrafts({ job: { title: 'Designer', company: 'Acme' } });
  assert.equal(drafts.length, 5);
  assert.match(drafts.find((item) => item.item_type === 'recruiter_message').draft_content, /Designer/);
  assert.match(drafts.find((item) => item.item_type === 'short_answer').source_evidence, /Needs user input/);
});
