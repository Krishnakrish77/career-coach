import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAtsSimulation, extractAtsRequirements } from '../src/ats-utils.js';

const STRONG_RESUME = `
  Jane Doe
  jane@example.com | (555) 123-4567 | linkedin.com/in/janedoe

  Skills: JavaScript, React, Node.js, PostgreSQL, AWS, stakeholder management

  Experience
  Senior Product Engineer, Acme Corp (2020-2025)
  - Built React and Node.js customer workflows backed by PostgreSQL and AWS.
  - Led stakeholder management across product, design, and operations.

  Software Engineer, Widgets Inc (2016-2020)
  - Delivered JavaScript services and analytics dashboards.

  Education
  Bachelor of Science, Computer Science
`;

test('extractAtsRequirements separates required and preferred terms', () => {
  const requirements = extractAtsRequirements({
    title: 'Senior Frontend Engineer',
    jd_text: `
      Required Qualifications
      5+ years of experience with JavaScript, React, and Node.js.
      Must have SQL experience.

      Preferred Qualifications
      AWS experience is a plus.
      Nice to have stakeholder management.
    `,
  });

  assert.deepEqual(requirements.required_terms, ['javascript', 'react', 'node.js', 'sql']);
  assert.deepEqual(requirements.preferred_terms, ['aws', 'stakeholder management']);
  assert.equal(requirements.has_required_language, true);
});

test('buildAtsSimulation blocks when no resume is saved', () => {
  const simulation = buildAtsSimulation({
    job: { title: 'Engineer', jd_text: 'Required: JavaScript and React experience. '.repeat(20) },
    resumeText: '',
  });

  assert.equal(simulation.status, 'blocked');
  assert.equal(simulation.resume_completeness.status, 'block');
  assert.ok(simulation.gates.some((gate) => gate.key === 'job_description' && gate.status === 'pass'));
});

test('buildAtsSimulation shows required gaps with actions instead of fabricating evidence', () => {
  const simulation = buildAtsSimulation({
    job: {
      title: 'Senior Platform Engineer',
      jd_text: `
        Required Qualifications
        5+ years of experience with Kubernetes, Terraform, and Python.
        Preferred: AWS and stakeholder management.
      `.repeat(8),
    },
    resumeText: STRONG_RESUME,
    preferences: { work_authorization: 'Authorized to work without sponsorship' },
  });

  assert.equal(simulation.status, 'needs_review');
  assert.deepEqual(simulation.missing_required, ['Python', 'Kubernetes', 'Terraform']);
  assert.ok(simulation.evidence.find((item) => item.term === 'kubernetes').action.includes('truthful resume evidence'));
});

test('buildAtsSimulation passes a well matched text resume and job description', () => {
  const simulation = buildAtsSimulation({
    job: {
      title: 'Senior Product Engineer',
      jd_text: `
        Required Qualifications
        5+ years of JavaScript, React, Node.js, SQL, and PostgreSQL experience.
        Must have stakeholder management experience.
        Preferred: AWS.
      `.repeat(10),
    },
    resumeText: STRONG_RESUME,
    preferences: { work_authorization: 'Authorized to work without sponsorship', remote_preference: 'remote' },
  });

  assert.equal(simulation.status, 'ready');
  assert.equal(simulation.missing_required.length, 0);
  assert.ok(simulation.overall_score >= 80);
});

test('buildAtsSimulation treats no-sponsorship conflicts as a hard gate only when the user needs sponsorship', () => {
  const job = {
    title: 'Backend Engineer',
    jd_text: 'Required: JavaScript and SQL. Candidates must be authorized to work; no sponsorship is available. '.repeat(12),
  };

  const ok = buildAtsSimulation({
    job,
    resumeText: STRONG_RESUME,
    preferences: { work_authorization: 'Authorized to work in the US without sponsorship' },
  });
  const blocked = buildAtsSimulation({
    job,
    resumeText: STRONG_RESUME,
    preferences: { work_authorization: 'Need H1B visa sponsorship' },
  });

  assert.ok(!ok.gates.some((gate) => gate.key === 'work_authorization' && gate.status === 'block'));
  assert.ok(blocked.gates.some((gate) => gate.key === 'work_authorization' && gate.status === 'block'));
  assert.equal(blocked.status, 'blocked');
});

test('extractAtsRequirements stops at a new non-requirements section', () => {
  const requirements = extractAtsRequirements({
    jd_text: `
      Requirements
      - React and TypeScript experience
      Responsibilities
      - Partner with the AWS platform team
    `,
  });

  assert.deepEqual(requirements.required_terms, ['typescript', 'react']);
  assert.ok(!requirements.required_terms.includes('aws'));
});

test('buildAtsSimulation scores matching required terms beyond the displayed evidence limit', () => {
  const skills = ['JavaScript', 'TypeScript', 'React', 'Vue', 'Angular', 'Node.js', 'Python', 'Java', 'PostgreSQL', 'MongoDB', 'Redis', 'AWS', 'Docker', 'Kubernetes', 'Terraform'];
  const simulation = buildAtsSimulation({
    job: { title: 'Platform Engineer', jd_text: `Required Qualifications\n${skills.join(', ')} experience.` },
    resumeText: `Alex Doe\nalex@example.com\n(555) 123-4567\nSkills: ${skills.join(', ')}\nExperience 2020-2025\nEducation: Bachelor degree`,
  });

  assert.equal(simulation.missing_required.length, 0);
  assert.equal(simulation.keyword_score, 100);
});

test('buildAtsSimulation warns when a remote-only preference meets a hybrid posting', () => {
  const simulation = buildAtsSimulation({
    job: { title: 'Engineer', jd_text: 'Required: JavaScript. This is a hybrid role with three office days each week.'.repeat(12) },
    resumeText: STRONG_RESUME,
    preferences: { remote_preference: 'remote' },
  });

  const locationGate = simulation.gates.find((gate) => gate.key === 'location');
  assert.equal(locationGate.status, 'warn');
  assert.match(locationGate.explanation, /hybrid/);
});
