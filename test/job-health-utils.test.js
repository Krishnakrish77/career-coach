import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyPostingResponse, detectAtsPosting, healthStatusLabel, parsePublicPostingUrl } from '../src/job-health-utils.js';

test('recognizes supported public ATS posting URLs', () => {
  assert.deepEqual(detectAtsPosting('https://boards.greenhouse.io/acme/jobs/12345'), {
    checker: 'greenhouse_api', url: 'https://boards-api.greenhouse.io/v1/boards/acme/jobs/12345',
  });
  assert.deepEqual(detectAtsPosting('https://jobs.lever.co/acme/abc-123'), {
    checker: 'lever_api', url: 'https://api.lever.co/v0/postings/acme/abc-123',
  });
});

test('rejects invalid and private posting URLs before any network call', () => {
  assert.equal(parsePublicPostingUrl('not a url').ok, false);
  assert.equal(parsePublicPostingUrl('http://127.0.0.1/admin').ok, false);
  assert.equal(parsePublicPostingUrl('http://192.168.0.5/job').ok, false);
  assert.equal(parsePublicPostingUrl('https://careers.example.com/jobs/1').ok, true);
});

test('only treats definitive missing responses as likely expired', () => {
  assert.equal(classifyPostingResponse(200).status, 'active');
  assert.equal(classifyPostingResponse(404, 'greenhouse_api').status, 'likely_expired');
  assert.equal(classifyPostingResponse(410).status, 'likely_expired');
  assert.equal(classifyPostingResponse(403).status, 'needs_review');
  assert.equal(classifyPostingResponse(500).status, 'needs_review');
});

test('uses concise user-facing health labels', () => {
  assert.equal(healthStatusLabel('unverified'), 'Not checked');
  assert.equal(healthStatusLabel('likely_expired'), 'Likely expired');
});
