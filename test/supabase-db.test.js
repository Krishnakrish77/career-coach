import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  listJobs,
  getJob,
  insertJob,
  updateJob,
  updateApplicationStatus,
  updateApplicationNotes,
  deleteJob,
  saveResume,
  getLatestResume,
  getProfilePreferences,
  saveProfilePreferences,
  saveOpportunityScorecard,
  addJobFeedback,
  listDiscoveryRecommendations,
  resolveDiscoveredJob,
  saveDiscoveryRecommendation,
  importDiscoveredJob,
  updateDiscoveryStatus,
  addDiscoveryFeedback,
  createApplicationPacket,
  getApplicationPacket,
  updateApplicationPacketItem,
  submitApplicationPacket,
  listJobArtifacts,
  tailorJob,
  extractResumeFromPdf,
  saveInterviewStory,
  saveWeeklyPlan,
  listCoachingReminders,
} from '../src/supabase-db.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../src/supabase-auth.js';

function fakeResponse({ ok = true, status = 200, json = null, noContent = false }) {
  return { ok, status: noContent ? 204 : status, json: async () => json, text: async () => JSON.stringify(json) };
}

// Records every call and returns responses from a queue, in order.
function fetchSequence(responses) {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, opts });
    return responses.shift();
  };
  return { fetchImpl, calls };
}

test('listJobs requests a light column set, capped, newest first', async () => {
  const { fetchImpl, calls } = fetchSequence([fakeResponse({ json: [{ id: '1' }] })]);
  const result = await listJobs('token-1', fetchImpl);
  assert.deepEqual(result, [{ id: '1' }]);
  assert.equal(
    calls[0].url,
    `${SUPABASE_URL}/rest/v1/jobs?select=id,url,title,company,source,created_at,capture_quality,applications(status,next_follow_up_at),job_matches(overall_grade,cv_match_score,recommendation,confidence)&order=created_at.desc&limit=100`,
  );
  assert.equal(calls[0].opts.headers.apikey, SUPABASE_ANON_KEY);
  assert.equal(calls[0].opts.headers.authorization, 'Bearer token-1');
});

test('getJob requests one job by id with the full row', async () => {
  const { fetchImpl, calls } = fetchSequence([fakeResponse({ json: [{ id: 'job-1', jd_text: 'full text' }] })]);
  const result = await getJob('token-1', 'job-1', fetchImpl);
  assert.equal(calls[0].url, `${SUPABASE_URL}/rest/v1/jobs?id=eq.job-1&select=*,applications(*),job_matches(*)`);
  assert.equal(result.jd_text, 'full text');
});

test('getJob returns null when the job does not exist or is not accessible', async () => {
  const { fetchImpl } = fetchSequence([fakeResponse({ json: [] })]);
  const result = await getJob('token-1', 'missing', fetchImpl);
  assert.equal(result, null);
});

test('insertJob computes dedup/quality fields and creates the paired applications row', async () => {
  const { fetchImpl, calls } = fetchSequence([
    fakeResponse({ json: [] }),
    fakeResponse({ json: [{ id: 'job-1', url: 'https://x.com/job/1' }] }),
    fakeResponse({ json: [{ id: 'app-1', job_id: 'job-1', status: 'saved' }] }),
  ]);

  const result = await insertJob(
    'token-1',
    { url: 'https://www.x.com/job/1/?utm_source=y', title: 'Eng', company: 'Acme', jd_text: 'x'.repeat(300) },
    fetchImpl,
  );

  assert.equal(calls.length, 3);
  assert.ok(calls[0].url.startsWith(`${SUPABASE_URL}/rest/v1/jobs?url=eq.`));
  assert.equal(calls[1].url, `${SUPABASE_URL}/rest/v1/jobs`);
  const jobBody = JSON.parse(calls[1].opts.body);
  assert.equal(jobBody.normalized_url, 'x.com/job/1');
  assert.equal(jobBody.capture_quality, 'complete');
  assert.equal(typeof jobBody.content_hash, 'string');
  assert.equal(jobBody.content_hash.length, 64);

  assert.equal(calls[2].url, `${SUPABASE_URL}/rest/v1/applications`);
  assert.deepEqual(JSON.parse(calls[2].opts.body), { job_id: 'job-1', status: 'saved' });

  assert.equal(result.id, 'job-1');
  assert.equal(result.duplicate, false);
  assert.equal(result.applications[0].status, 'saved');
});

test('insertJob returns the existing job with duplicate:true on a unique-index conflict', async () => {
  const { fetchImpl, calls } = fetchSequence([
    fakeResponse({ json: [] }),
    fakeResponse({ ok: false, status: 409, json: { message: 'duplicate key value violates unique constraint' } }),
    fakeResponse({ json: [{ id: 'job-1', url: 'https://x.com/job/1', applications: [{ status: 'applied' }] }] }),
  ]);

  const result = await insertJob('token-1', { url: 'https://x.com/job/1', title: 'Eng', company: 'Acme', jd_text: 'text' }, fetchImpl);

  assert.equal(calls.length, 3);
  assert.ok(calls[2].url.startsWith(`${SUPABASE_URL}/rest/v1/jobs?normalized_url=eq.`));
  assert.equal(result.duplicate, true);
  assert.equal(result.id, 'job-1');
});

test('insertJob returns an exact URL duplicate for jobs saved before normalized_url existed', async () => {
  const { fetchImpl, calls } = fetchSequence([
    fakeResponse({ json: [{ id: 'job-old', url: 'https://x.com/job/1', applications: [{ status: 'saved' }] }] }),
  ]);

  const result = await insertJob('token-1', { url: 'https://x.com/job/1', title: 'Eng', company: 'Acme', jd_text: 'text' }, fetchImpl);

  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.startsWith(`${SUPABASE_URL}/rest/v1/jobs?url=eq.`));
  assert.equal(result.duplicate, true);
  assert.equal(result.id, 'job-old');
});

test('insertJob ignores exact URL matches that are not in the user application tracker', async () => {
  const { fetchImpl, calls } = fetchSequence([
    fakeResponse({ json: [{ id: 'shared-job', url: 'https://x.com/job/1', applications: [] }] }),
    fakeResponse({ json: [{ id: 'job-1', url: 'https://x.com/job/1' }] }),
    fakeResponse({ json: [{ id: 'app-1', job_id: 'job-1', status: 'saved' }] }),
  ]);

  const result = await insertJob('token-1', { url: 'https://x.com/job/1', title: 'Eng', company: 'Acme', jd_text: 'text' }, fetchImpl);

  assert.equal(calls.length, 3);
  assert.equal(result.duplicate, false);
  assert.equal(result.id, 'job-1');
});

test('insertJob rethrows non-conflict errors instead of treating them as a duplicate', async () => {
  const { fetchImpl } = fetchSequence([
    fakeResponse({ json: [] }),
    fakeResponse({ ok: false, status: 401, json: { message: 'JWT expired' } }),
  ]);
  await assert.rejects(
    () => insertJob('token-1', { url: 'https://x.com', title: 'Eng', company: 'Acme', jd_text: 'text' }, fetchImpl),
    /Supabase error 401/,
  );
});

test('updateJob PATCHes editable fields and recomputes capture_quality', async () => {
  const { fetchImpl, calls } = fetchSequence([fakeResponse({ json: [{ id: 'job-1', capture_quality: 'complete' }] })]);
  await updateJob(
    'token-1',
    'job-1',
    { url: 'https://x.com/job/1', title: 'Eng', company: 'Acme', location: 'Remote', jd_text: 'x'.repeat(300) },
    fetchImpl,
  );
  assert.equal(calls[0].url, `${SUPABASE_URL}/rest/v1/jobs?id=eq.job-1`);
  assert.equal(calls[0].opts.method, 'PATCH');
  const body = JSON.parse(calls[0].opts.body);
  assert.equal(body.location, 'Remote');
  assert.equal(body.capture_quality, 'complete');
});

test('updateApplicationStatus PATCHes the applications row for that job', async () => {
  const { fetchImpl, calls } = fetchSequence([fakeResponse({ json: [{ status: 'applied' }] })]);
  await updateApplicationStatus('token-1', 'job-1', 'applied', fetchImpl);
  assert.equal(calls[0].url, `${SUPABASE_URL}/rest/v1/applications?job_id=eq.job-1`);
  assert.equal(calls[0].opts.method, 'PATCH');
  assert.equal(JSON.parse(calls[0].opts.body).status, 'applied');
});

test('updateApplicationNotes PATCHes notes and next_follow_up_at', async () => {
  const { fetchImpl, calls } = fetchSequence([fakeResponse({ json: [{ notes: 'follow up' }] })]);
  await updateApplicationNotes('token-1', 'job-1', { notes: 'follow up', nextFollowUpAt: '2026-08-01T00:00:00.000Z' }, fetchImpl);
  const body = JSON.parse(calls[0].opts.body);
  assert.equal(body.notes, 'follow up');
  assert.equal(body.next_follow_up_at, '2026-08-01T00:00:00.000Z');
});

test('deleteJob issues a DELETE against the job id', async () => {
  const { fetchImpl, calls } = fetchSequence([fakeResponse({ noContent: true })]);
  const result = await deleteJob('token-1', 'job-1', fetchImpl);
  assert.equal(calls[0].url, `${SUPABASE_URL}/rest/v1/jobs?id=eq.job-1`);
  assert.equal(calls[0].opts.method, 'DELETE');
  assert.equal(result, null);
});

test('saveResume posts raw_text and returns the inserted row', async () => {
  const { fetchImpl, calls } = fetchSequence([fakeResponse({ json: [{ id: 'r1', raw_text: 'my resume' }] })]);
  const result = await saveResume('token-1', 'my resume', fetchImpl);
  assert.equal(calls[0].url, `${SUPABASE_URL}/rest/v1/resumes`);
  assert.deepEqual(JSON.parse(calls[0].opts.body), { raw_text: 'my resume' });
  assert.equal(result.id, 'r1');
});

test('getLatestResume returns the most recently saved row', async () => {
  const { fetchImpl, calls } = fetchSequence([fakeResponse({ json: [{ raw_text: 'latest' }] })]);
  const result = await getLatestResume('token-1', fetchImpl);
  assert.equal(calls[0].url, `${SUPABASE_URL}/rest/v1/resumes?select=id,raw_text,created_at&order=created_at.desc&limit=1`);
  assert.equal(result.raw_text, 'latest');
});

test('getLatestResume returns null when there is no resume yet', async () => {
  const { fetchImpl } = fetchSequence([fakeResponse({ json: [] })]);
  const result = await getLatestResume('token-1', fetchImpl);
  assert.equal(result, null);
});

test('profile preferences are merged into the private profile row', async () => {
  const { fetchImpl, calls } = fetchSequence([fakeResponse({ json: [{ target_titles: ['Engineer'] }] })]);
  const result = await saveProfilePreferences('token-1', { target_titles: ['Engineer'], remote_preference: 'remote' }, fetchImpl);
  assert.equal(calls[0].url, `${SUPABASE_URL}/rest/v1/profiles?on_conflict=user_id`);
  assert.equal(calls[0].opts.headers.prefer, 'resolution=merge-duplicates,return=representation');
  assert.equal(JSON.parse(calls[0].opts.body).remote_preference, 'remote');
  assert.deepEqual(result.target_titles, ['Engineer']);
});

test('interview stories save through the private story-bank endpoint', async () => {
  const { fetchImpl, calls } = fetchSequence([fakeResponse({ json: [{ id: 'story-1' }] })]);
  await saveInterviewStory('token-1', { title: 'Launch', skills: ['leadership'] }, fetchImpl);
  assert.equal(calls[0].url, `${SUPABASE_URL}/rest/v1/interview_stories`);
  assert.equal(calls[0].opts.method, 'POST');
  assert.equal(JSON.parse(calls[0].opts.body).title, 'Launch');
});

test('saveInterviewStory PATCHes an existing story by id instead of creating a new one', async () => {
  const { fetchImpl, calls } = fetchSequence([fakeResponse({ json: [{ id: 'story-1', title: 'Launch v2' }] })]);
  const result = await saveInterviewStory('token-1', { id: 'story-1', title: 'Launch v2', skills: ['leadership'] }, fetchImpl);
  assert.equal(calls[0].url, `${SUPABASE_URL}/rest/v1/interview_stories?id=eq.story-1`);
  assert.equal(calls[0].opts.method, 'PATCH');
  assert.equal(JSON.parse(calls[0].opts.body).id, undefined);
  assert.equal(result.title, 'Launch v2');
});

test('weekly plan saves its header and user-owned items separately', async () => {
  const { fetchImpl, calls } = fetchSequence([fakeResponse({ json: [{ id: 'plan-1' }] }), fakeResponse({ json: [] })]);
  await saveWeeklyPlan('token-1', { weekStart: '2026-07-13', summary: 'Focus', items: [{ item_type: 'apply', description: 'Apply', target_count: 2 }] }, fetchImpl);
  assert.equal(calls[0].url, `${SUPABASE_URL}/rest/v1/weekly_plans?on_conflict=user_id,week_start`);
  assert.equal(calls[1].url, `${SUPABASE_URL}/rest/v1/weekly_plan_items`);
  assert.equal(JSON.parse(calls[1].opts.body)[0].weekly_plan_id, 'plan-1');
});

test('opportunity scorecard persists individual factors and explanation', async () => {
  const { fetchImpl, calls } = fetchSequence([fakeResponse({ json: [{ recommendation: 'apply_now' }] })]);
  const scorecard = {
    overall_score: 80, recommendation: 'apply_now', confidence: 'medium',
    factors: [{ key: 'must_have_skills', score: 90 }, { key: 'seniority_fit', score: 80 }, { key: 'location_fit', score: 70 }, { key: 'compensation_fit', score: 60 }, { key: 'job_quality', score: 95 }],
  };
  await saveOpportunityScorecard('token-1', 'job-1', scorecard, fetchImpl);
  assert.equal(calls[0].url, `${SUPABASE_URL}/rest/v1/job_matches?on_conflict=user_id,job_id`);
  const body = JSON.parse(calls[0].opts.body);
  assert.equal(body.job_id, 'job-1');
  assert.equal(body.job_quality_score, 95);
  assert.equal(body.recommendation, 'apply_now');
});

test('job feedback is an explicit user action', async () => {
  const { fetchImpl, calls } = fetchSequence([fakeResponse({ json: [{ id: 'feedback-1' }] })]);
  await addJobFeedback('token-1', 'job-1', { actionTaken: 'skipped', reason: 'location' }, fetchImpl);
  assert.equal(calls[0].url, `${SUPABASE_URL}/rest/v1/job_feedback`);
  assert.deepEqual(JSON.parse(calls[0].opts.body), { job_id: 'job-1', action_taken: 'skipped', reason: 'location' });
});

test('listDiscoveryRecommendations requests the queue with its discovered job embedded, newest first', async () => {
  const { fetchImpl, calls } = fetchSequence([fakeResponse({ json: [{ id: 'rec-1', discovered_jobs: { id: 'job-1' } }] })]);
  const result = await listDiscoveryRecommendations('token-1', fetchImpl);
  assert.equal(
    calls[0].url,
    `${SUPABASE_URL}/rest/v1/job_recommendations?select=*,discovered_jobs(*)&order=updated_at.desc&limit=100`,
  );
  assert.equal(result[0].id, 'rec-1');
});

const LONG_JD_TEXT = 'Detailed responsibilities and requirements for this role. '.repeat(3);

test('importDiscoveredJob upserts the discovered job then its recommendation', async () => {
  const { fetchImpl, calls } = fetchSequence([
    fakeResponse({ json: [] }),
    fakeResponse({ json: [{ id: 'discovered-1' }] }),
    fakeResponse({ json: [{ id: 'rec-1', recommendation_label: 'strong_match' }] }),
  ]);
  const job = { source_url: 'https://acme.test/jobs/1', title: 'Engineer', company: 'Acme', jd_text: LONG_JD_TEXT };
  const recommendation = { preference_fit_score: 80, job_quality_score: 90, recommendation_label: 'strong_match', reasoning: {} };
  const result = await importDiscoveredJob('token-1', job, recommendation, fetchImpl);

  assert.ok(calls[0].url.includes('content_hash=eq.'));
  assert.equal(calls[1].url, `${SUPABASE_URL}/rest/v1/discovered_jobs?on_conflict=user_id,normalized_url`);
  assert.equal(calls[1].opts.headers.prefer, 'resolution=merge-duplicates,return=representation');
  const discoveredBody = JSON.parse(calls[1].opts.body);
  assert.equal(discoveredBody.normalized_url, 'acme.test/jobs/1');
  assert.equal(typeof discoveredBody.content_hash, 'string');

  assert.equal(calls[2].url, `${SUPABASE_URL}/rest/v1/job_recommendations?on_conflict=user_id,discovered_job_id`);
  assert.deepEqual(JSON.parse(calls[2].opts.body), { discovered_job_id: 'discovered-1', ...recommendation });

  assert.equal(result.discovered.id, 'discovered-1');
  assert.equal(result.recommendation.id, 'rec-1');
});

test('importDiscoveredJob reuses a matching content hash across repost URLs', async () => {
  const { fetchImpl, calls } = fetchSequence([fakeResponse({ json: [{ id: 'existing' }] }), fakeResponse({ json: [{ id: 'rec' }] })]);
  const result = await importDiscoveredJob('token-1', { source_url: 'https://b.test/job', jd_text: LONG_JD_TEXT }, { preference_fit_score: 50, job_quality_score: 50, recommendation_label: 'worth_reviewing' }, fetchImpl);
  assert.ok(calls[0].url.includes('content_hash=eq.'));
  assert.equal(calls[1].url, `${SUPABASE_URL}/rest/v1/job_recommendations?on_conflict=user_id,discovered_job_id`);
  assert.equal(result.discovered.id, 'existing');
});

test('resolveDiscoveredJob skips the content-hash lookup for blank/short descriptions', async () => {
  const { fetchImpl, calls } = fetchSequence([fakeResponse({ json: [{ id: 'discovered-1' }] })]);
  await resolveDiscoveredJob('token-1', { source_url: 'https://acme.test/jobs/1', jd_text: '' }, fetchImpl);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${SUPABASE_URL}/rest/v1/discovered_jobs?on_conflict=user_id,normalized_url`);
});

test('resolveDiscoveredJob never merges two different jobs that both lack a description', async () => {
  // Regression test against a stateful fake backend: hashContent('') is a
  // constant, so a buggy implementation that trusts content_hash on blank
  // descriptions would incorrectly resolve both imports to the same row.
  const rows = new Map();
  let nextId = 1;
  const fetchImpl = async (url, opts) => {
    const parsed = new URL(url);
    if (opts.method === 'POST') {
      const body = JSON.parse(opts.body);
      const row = { id: `row-${nextId++}`, ...body };
      rows.set(row.id, row);
      return fakeResponse({ json: [row] });
    }
    const hash = parsed.searchParams.get('content_hash')?.replace('eq.', '');
    const match = [...rows.values()].find((row) => row.content_hash === hash);
    return fakeResponse({ json: match ? [match] : [] });
  };

  const rowA = await resolveDiscoveredJob(
    'token-1',
    { source_url: 'https://acme.test/jobs/1', title: 'Backend Engineer', company: 'Acme', jd_text: '' },
    fetchImpl,
  );
  const rowB = await resolveDiscoveredJob(
    'token-1',
    { source_url: 'https://widgetco.test/careers/2', title: 'Marketing Manager', company: 'WidgetCo', jd_text: '' },
    fetchImpl,
  );

  assert.notEqual(rowA.id, rowB.id);
  assert.equal(rowB.company, 'WidgetCo');
});

test('updateDiscoveryStatus PATCHes the recommendation row by id', async () => {
  const { fetchImpl, calls } = fetchSequence([fakeResponse({ json: [{ id: 'rec-1', status: 'saved' }] })]);
  const result = await updateDiscoveryStatus('token-1', 'rec-1', 'saved', fetchImpl);
  assert.equal(calls[0].url, `${SUPABASE_URL}/rest/v1/job_recommendations?id=eq.rec-1`);
  assert.equal(calls[0].opts.method, 'PATCH');
  assert.equal(JSON.parse(calls[0].opts.body).status, 'saved');
  assert.equal(result.status, 'saved');
});

test('addDiscoveryFeedback derives sentiment from the action', async () => {
  const { fetchImpl, calls } = fetchSequence([fakeResponse({ json: [{ id: 'feedback-1' }] })]);
  await addDiscoveryFeedback('token-1', 'discovered-1', { action: 'like', reasons: ['tech stack'] }, fetchImpl);
  assert.equal(calls[0].url, `${SUPABASE_URL}/rest/v1/job_preference_feedback`);
  assert.deepEqual(JSON.parse(calls[0].opts.body), {
    discovered_job_id: 'discovered-1',
    sentiment: 'positive',
    action: 'like',
    reasons: ['tech stack'],
  });
});

test('addDiscoveryFeedback treats skip/hide as negative sentiment', async () => {
  const { fetchImpl, calls } = fetchSequence([fakeResponse({ json: [{ id: 'feedback-1' }] })]);
  await addDiscoveryFeedback('token-1', 'discovered-1', { action: 'hide' }, fetchImpl);
  assert.equal(JSON.parse(calls[0].opts.body).sentiment, 'negative');
});

test('listCoachingReminders excludes snoozed reminders that are not yet due', async () => {
  const { fetchImpl, calls } = fetchSequence([fakeResponse({ json: [{ id: 'reminder-1', status: 'open' }] })]);
  await listCoachingReminders('token-1', fetchImpl);
  const url = decodeURIComponent(calls[0].url);
  assert.ok(url.includes('or=(status.eq.open,and(status.eq.snoozed,due_at.lte.'));
  assert.equal(url.includes('status=in.(open,snoozed)'), false);
});

test('application packets are created with items but never submitted implicitly', async () => {
  const { fetchImpl, calls } = fetchSequence([
    fakeResponse({ json: [{ id: 'packet-1' }] }),
    fakeResponse({ noContent: true }),
  ]);
  await createApplicationPacket('token-1', { jobId: 'job-1', resumeId: 'resume-1', items: [{ item_type: 'cover_letter', label: 'Cover letter', draft_content: 'draft' }] }, fetchImpl);
  assert.equal(calls[0].url, `${SUPABASE_URL}/rest/v1/application_packets?on_conflict=user_id,job_id`);
  assert.equal(calls[1].url, `${SUPABASE_URL}/rest/v1/application_packet_items?on_conflict=packet_id,item_type,label`);
  assert.equal(JSON.parse(calls[1].opts.body)[0].packet_id, 'packet-1');
});

test('packet submission explicitly creates a submission then marks packet submitted', async () => {
  const { fetchImpl, calls } = fetchSequence([fakeResponse({ json: [{ id: 'submission-1' }] }), fakeResponse({ json: [{ status: 'submitted' }] })]);
  await submitApplicationPacket('token-1', 'packet-1', { confirmationText: 'ABC', followUpAt: null }, fetchImpl);
  assert.equal(calls[0].url, `${SUPABASE_URL}/rest/v1/application_submissions?on_conflict=packet_id`);
  assert.equal(calls[1].url, `${SUPABASE_URL}/rest/v1/application_packets?id=eq.packet-1`);
  assert.equal(JSON.parse(calls[1].opts.body).status, 'submitted');
});

test('listJobArtifacts requests history for one job, newest first', async () => {
  const { fetchImpl, calls } = fetchSequence([fakeResponse({ json: [{ id: 'a1', artifact_type: 'cover_letter' }] })]);
  const result = await listJobArtifacts('token-1', 'job-1', fetchImpl);
  assert.equal(calls[0].url, `${SUPABASE_URL}/rest/v1/job_artifacts?job_id=eq.job-1&select=*&order=created_at.desc&limit=20`);
  assert.equal(result[0].artifact_type, 'cover_letter');
});

test('throws with status and body on a non-ok response', async () => {
  const { fetchImpl } = fetchSequence([fakeResponse({ ok: false, status: 401, json: { message: 'JWT expired' } })]);
  await assert.rejects(() => listJobs('token-1', fetchImpl), /Supabase error 401/);
});

test('tailorJob posts only job_id to the Edge Function and returns the application row', async () => {
  const { fetchImpl, calls } = fetchSequence([
    fakeResponse({ json: { job_id: 'job-1', tailored_resume: 'resume', cover_letter: 'letter' } }),
  ]);
  const result = await tailorJob('token-1', 'job-1', fetchImpl);
  assert.equal(calls[0].url, `${SUPABASE_URL}/functions/v1/tailor`);
  assert.equal(calls[0].opts.headers.authorization, 'Bearer token-1');
  assert.deepEqual(JSON.parse(calls[0].opts.body), { job_id: 'job-1' });
  assert.equal(result.tailored_resume, 'resume');
});

test('tailorJob surfaces the Edge Function error message on failure', async () => {
  const { fetchImpl } = fetchSequence([fakeResponse({ ok: false, status: 400, json: { error: 'No resume on file.' } })]);
  await assert.rejects(() => tailorJob('token-1', 'job-1', fetchImpl), /No resume on file\./);
});

test('extractResumeFromPdf posts the base64 payload and returns raw_text', async () => {
  const ats_readiness = { status: 'ok' };
  const { fetchImpl, calls } = fetchSequence([fakeResponse({ json: { raw_text: 'extracted resume text', ats_readiness } })]);
  const result = await extractResumeFromPdf('token-1', 'BASE64DATA', fetchImpl);
  assert.equal(calls[0].url, `${SUPABASE_URL}/functions/v1/extract-resume`);
  assert.equal(calls[0].opts.headers.authorization, 'Bearer token-1');
  assert.deepEqual(JSON.parse(calls[0].opts.body), { pdf_base64: 'BASE64DATA' });
  assert.deepEqual(result, { rawText: 'extracted resume text', atsReadiness: ats_readiness });
});

test('extractResumeFromPdf surfaces the Edge Function error message on failure', async () => {
  const { fetchImpl } = fetchSequence([fakeResponse({ ok: false, status: 422, json: { error: 'Could not extract any text from that PDF.' } })]);
  await assert.rejects(() => extractResumeFromPdf('token-1', 'BASE64DATA', fetchImpl), /Could not extract any text/);
});
