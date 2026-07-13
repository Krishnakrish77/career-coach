import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  listJobs,
  getJob,
  insertJob,
  updateApplicationStatus,
  deleteJob,
  saveResume,
  getLatestResume,
  tailorJob,
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
    `${SUPABASE_URL}/rest/v1/jobs?select=id,url,title,company,created_at,applications(status)&order=created_at.desc&limit=100`,
  );
  assert.equal(calls[0].opts.headers.apikey, SUPABASE_ANON_KEY);
  assert.equal(calls[0].opts.headers.authorization, 'Bearer token-1');
});

test('getJob requests one job by id with the full row', async () => {
  const { fetchImpl, calls } = fetchSequence([fakeResponse({ json: [{ id: 'job-1', jd_text: 'full text' }] })]);
  const result = await getJob('token-1', 'job-1', fetchImpl);
  assert.equal(calls[0].url, `${SUPABASE_URL}/rest/v1/jobs?id=eq.job-1&select=*,applications(*)`);
  assert.equal(result.jd_text, 'full text');
});

test('getJob returns null when the job does not exist or is not accessible', async () => {
  const { fetchImpl } = fetchSequence([fakeResponse({ json: [] })]);
  const result = await getJob('token-1', 'missing', fetchImpl);
  assert.equal(result, null);
});

test('insertJob creates the job then its paired applications row', async () => {
  const { fetchImpl, calls } = fetchSequence([
    fakeResponse({ json: [{ id: 'job-1', url: 'https://x', title: 'Eng' }] }),
    fakeResponse({ json: [{ id: 'app-1', job_id: 'job-1', status: 'saved' }] }),
  ]);

  const result = await insertJob('token-1', { url: 'https://x', title: 'Eng', company: null, jd_text: 'text' }, fetchImpl);

  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, `${SUPABASE_URL}/rest/v1/jobs`);
  assert.equal(calls[0].opts.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].opts.body), { url: 'https://x', title: 'Eng', company: null, jd_text: 'text', source: 'manual' });

  assert.equal(calls[1].url, `${SUPABASE_URL}/rest/v1/applications`);
  assert.deepEqual(JSON.parse(calls[1].opts.body), { job_id: 'job-1', status: 'saved' });

  assert.equal(result.id, 'job-1');
  assert.equal(result.applications[0].status, 'saved');
});

test('updateApplicationStatus PATCHes the applications row for that job', async () => {
  const { fetchImpl, calls } = fetchSequence([fakeResponse({ json: [{ status: 'applied' }] })]);
  await updateApplicationStatus('token-1', 'job-1', 'applied', fetchImpl);
  assert.equal(calls[0].url, `${SUPABASE_URL}/rest/v1/applications?job_id=eq.job-1`);
  assert.equal(calls[0].opts.method, 'PATCH');
  assert.equal(JSON.parse(calls[0].opts.body).status, 'applied');
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
  assert.deepEqual(JSON.parse(calls[0].opts.body), { raw_text: 'my resume' });
  assert.equal(result.id, 'r1');
});

test('getLatestResume returns the first row', async () => {
  const { fetchImpl, calls } = fetchSequence([fakeResponse({ json: [{ raw_text: 'latest' }] })]);
  const result = await getLatestResume('token-1', fetchImpl);
  assert.equal(calls[0].url, `${SUPABASE_URL}/rest/v1/resumes?select=raw_text,created_at&order=created_at.desc&limit=1`);
  assert.equal(result.raw_text, 'latest');
});

test('getLatestResume returns null when there is no resume yet', async () => {
  const { fetchImpl } = fetchSequence([fakeResponse({ json: [] })]);
  const result = await getLatestResume('token-1', fetchImpl);
  assert.equal(result, null);
});

test('throws with status and body on a non-ok response', async () => {
  const { fetchImpl } = fetchSequence([fakeResponse({ ok: false, status: 401, json: { message: 'JWT expired' } })]);
  await assert.rejects(() => listJobs('token-1', fetchImpl), /Supabase error 401/);
});

test('tailorJob posts job_id/provider/model to the Edge Function and returns the application row', async () => {
  const { fetchImpl, calls } = fetchSequence([
    fakeResponse({ json: { job_id: 'job-1', tailored_resume: 'resume', cover_letter: 'letter' } }),
  ]);
  const result = await tailorJob('token-1', 'job-1', { provider: 'anthropic', model: 'claude-opus-4-8' }, fetchImpl);
  assert.equal(calls[0].url, `${SUPABASE_URL}/functions/v1/tailor`);
  assert.equal(calls[0].opts.headers.authorization, 'Bearer token-1');
  assert.deepEqual(JSON.parse(calls[0].opts.body), { job_id: 'job-1', provider: 'anthropic', model: 'claude-opus-4-8' });
  assert.equal(result.tailored_resume, 'resume');
});

test('tailorJob surfaces the Edge Function error message on failure', async () => {
  const { fetchImpl } = fetchSequence([fakeResponse({ ok: false, status: 400, json: { error: 'No resume on file.' } })]);
  await assert.rejects(() => tailorJob('token-1', 'job-1', {}, fetchImpl), /No resume on file\./);
});
