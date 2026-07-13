import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUrl, hashContent, computeCaptureQuality, checkResumeHealth } from '../src/job-utils.js';

test('normalizeUrl strips tracking params, fragment, www, and trailing slash', () => {
  assert.equal(
    normalizeUrl('https://www.Example.com/jobs/123/?utm_source=x&jk=ABC123&fbclid=tracking#apply'),
    'example.com/jobs/123?jk=ABC123',
  );
  assert.equal(normalizeUrl('https://boards.greenhouse.io/acme/jobs/9/'), 'boards.greenhouse.io/acme/jobs/9');
});

test('normalizeUrl preserves query params that identify distinct jobs', () => {
  assert.notEqual(
    normalizeUrl('https://www.indeed.com/viewjob?jk=abc&utm_campaign=x'),
    normalizeUrl('https://www.indeed.com/viewjob?jk=def&utm_campaign=x'),
  );
  assert.equal(
    normalizeUrl('https://jobs.example.com/view?currentJobId=42&gh_jid=99&utm_medium=email'),
    'jobs.example.com/view?currentJobId=42&gh_jid=99',
  );
});

test('normalizeUrl falls back to a lowercased trim on an invalid URL', () => {
  assert.equal(normalizeUrl('  Not A URL  '), 'not a url');
});

test('hashContent is deterministic and trims whitespace', async () => {
  const a = await hashContent('  same text  ');
  const b = await hashContent('same text');
  assert.equal(a, b);
  assert.equal(a.length, 64);
});

test('hashContent differs for different text', async () => {
  const a = await hashContent('one posting');
  const b = await hashContent('another posting');
  assert.notEqual(a, b);
});

test('computeCaptureQuality: no URL is always needs_review', () => {
  assert.equal(computeCaptureQuality({ title: 'Eng', company: 'Acme', jd_text: 'x'.repeat(300) }), 'needs_review');
});

test('computeCaptureQuality: title + company + long jd is complete', () => {
  assert.equal(
    computeCaptureQuality({ title: 'Eng', company: 'Acme', url: 'https://x', jd_text: 'x'.repeat(300) }),
    'complete',
  );
});

test('computeCaptureQuality: partial when missing company but has some jd text', () => {
  assert.equal(
    computeCaptureQuality({ title: 'Eng', url: 'https://x', jd_text: 'x'.repeat(60) }),
    'partial',
  );
});

test('computeCaptureQuality: needs_review when almost nothing captured', () => {
  assert.equal(computeCaptureQuality({ url: 'https://x' }), 'needs_review');
});

test('checkResumeHealth flags a bare-minimum resume', () => {
  const issues = checkResumeHealth('Hi I am looking for a job.');
  assert.ok(issues.length >= 4);
});

test('checkResumeHealth passes a well-formed resume', () => {
  const resume = `
    Jane Doe
    jane@example.com | (555) 123-4567

    Skills: JavaScript, SQL, Communication

    Experience
    Senior Engineer, Acme Corp (2020-2024)
    - Led migration of the billing pipeline.
    Engineer, Widgets Inc (2016-2020)
    - Built the widget dashboard.
  `;
  assert.deepEqual(checkResumeHealth(resume), []);
});
