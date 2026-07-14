import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCompanyResearchBrief } from '../src/company-research-utils.js';

const job = {
  title: 'Senior Platform Engineer',
  company: 'Acme',
  jd_text: 'Requirements\n- Python\n- AWS\n- Kubernetes\nPreferred\n- React',
};

test('company research brief uses only confirmed evidence and creates editable draft types', () => {
  const brief = buildCompanyResearchBrief({
    job,
    sourceNotes: 'Acme says its platform team is improving developer reliability.',
    careerEvidence: [
      { title: 'Unverified claim', evidence_text: 'I invented a metric.', review_status: 'needs_review' },
      { title: 'Platform migration', evidence_text: 'Led a Python platform migration used by three teams.', review_status: 'user_confirmed' },
    ],
  });

  assert.deepEqual(brief.role_themes, ['python', 'aws', 'kubernetes']);
  assert.equal(brief.evidence_title, 'Platform migration');
  assert.match(brief.source_context, /developer reliability/i);
  assert.match(brief.outreach.recruiter_message, /Platform migration/);
  assert.doesNotMatch(brief.outreach.recruiter_message, /invented/i);
  assert.ok(brief.outreach.linkedin_note);
  assert.match(brief.outreach.follow_up_email, /^Subject:/);
});

test('company research brief is transparent when no company notes are supplied', () => {
  const brief = buildCompanyResearchBrief({ job, careerEvidence: [] });
  assert.equal(brief.source_context, null);
  assert.match(brief.questions_to_investigate[2], /official company source/i);
  assert.doesNotMatch(brief.outreach.recruiter_message, /I also reviewed the company context/i);
});
