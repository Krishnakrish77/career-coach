import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildJobCapture, cleanCapturedText, cleanCapturedTitle } from '../src/capture-utils.js';

test('focused LinkedIn-style description wins over page navigation noise', () => {
  const description = `About the role\nWe are looking for an automation and AI QA lead to own end-to-end quality strategy across distributed teams.\nYou will build resilient test systems, coach engineers, and improve release confidence with measurable outcomes.`;
  const capture = buildJobCapture({
    pageTitle: 'QA Lead (Automation & AI) | Caterpillar Inc. | LinkedIn',
    metadata: { title: 'QA Lead (Automation & AI)', company: 'Caterpillar Inc.', location: 'Chicago, IL' },
    descriptionCandidates: [{ priority: 100, text: description }],
    fallbackText: `0 notifications\nSkip to search\nHome\nMy Network\n${description}\nMessaging`,
  });
  assert.equal(capture.source, 'focused');
  assert.equal(capture.confidence, 'high');
  assert.equal(capture.title, 'QA Lead (Automation & AI)');
  assert.equal(capture.company, 'Caterpillar Inc.');
  assert.equal(capture.location, 'Chicago, IL');
  assert.ok(!capture.jd_text.includes('Skip to search'));
});

test('fallback capture removes known navigation lines and signals lower confidence', () => {
  const capture = buildJobCapture({
    pageTitle: 'Quality Lead | LinkedIn',
    fallbackText: `Skip to main content\nHome\nQuality Lead\nOwn the quality strategy and build automated validation for customer-facing product releases across several teams.\nMessaging`,
  });
  assert.equal(capture.source, 'fallback');
  assert.equal(capture.confidence, 'needs_review');
  assert.equal(capture.title, 'Quality Lead');
  assert.ok(!capture.jd_text.includes('Skip to main content'));
  assert.ok(capture.jd_text.includes('Own the quality strategy'));
});

test('generic captures retain the descriptive page title without trusted job metadata', () => {
  const capture = buildJobCapture({
    pageTitle: 'Senior Backend Engineer - Acme Careers',
    metadata: { company: 'Acme' },
    descriptionCandidates: [{ priority: 45, text: 'Build backend systems that serve customers around the world while collaborating closely with product and infrastructure teams.' }],
  });
  assert.equal(capture.title, 'Senior Backend Engineer - Acme Careers');
});

test('cleaning removes duplicate UI lines without removing the job content', () => {
  assert.equal(cleanCapturedText('Jobs\nJobs\nBuild reliable systems\nBuild reliable systems'), 'Build reliable systems');
  assert.equal(cleanCapturedTitle('Senior QA Engineer | LinkedIn'), 'Senior QA Engineer');
});
