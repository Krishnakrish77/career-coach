import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-auth.js';

async function restRequest(path, accessToken, { method = 'GET', body, extraHeaders = {} } = {}, fetchImpl = fetch) {
  const res = await fetchImpl(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      authorization: `Bearer ${accessToken}`,
      ...extraHeaders,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Supabase error ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

// jobs joined with the caller's own applications row (RLS scopes the nested
// select automatically — a shared-pool job with someone else's application
// row never leaks through this join).
export async function listJobs(accessToken, fetchImpl = fetch) {
  return restRequest('jobs?select=*,applications(*)&order=created_at.desc', accessToken, {}, fetchImpl);
}

// Creates the job row, then its paired applications row (status defaults to
// 'saved'). Two requests because a job can exist without belonging to the
// caller (the future shared discovery pool) — applications is what's always
// per-user, so it's always its own insert.
export async function insertJob(accessToken, { url, title, company, jd_text }, fetchImpl = fetch) {
  const [job] = await restRequest(
    'jobs',
    accessToken,
    { method: 'POST', body: { url, title, company, jd_text, source: 'manual' }, extraHeaders: { prefer: 'return=representation' } },
    fetchImpl,
  );
  const [application] = await restRequest(
    'applications',
    accessToken,
    { method: 'POST', body: { job_id: job.id, status: 'saved' }, extraHeaders: { prefer: 'return=representation' } },
    fetchImpl,
  );
  return { ...job, applications: [application] };
}

export async function updateApplicationStatus(accessToken, jobId, status, fetchImpl = fetch) {
  return restRequest(
    `applications?job_id=eq.${jobId}`,
    accessToken,
    { method: 'PATCH', body: { status, updated_at: new Date().toISOString() }, extraHeaders: { prefer: 'return=representation' } },
    fetchImpl,
  );
}

export async function deleteJob(accessToken, jobId, fetchImpl = fetch) {
  // applications row cascade-deletes via the job_id foreign key.
  return restRequest(`jobs?id=eq.${jobId}`, accessToken, { method: 'DELETE' }, fetchImpl);
}

export async function saveResume(accessToken, rawText, fetchImpl = fetch) {
  const [resume] = await restRequest(
    'resumes',
    accessToken,
    { method: 'POST', body: { raw_text: rawText }, extraHeaders: { prefer: 'return=representation' } },
    fetchImpl,
  );
  return resume;
}

export async function getLatestResume(accessToken, fetchImpl = fetch) {
  const rows = await restRequest('resumes?select=raw_text,created_at&order=created_at.desc&limit=1', accessToken, {}, fetchImpl);
  return rows[0] || null;
}

// Calls the `tailor` Edge Function, which runs the LLM call server-side with
// the operator's key and writes the result onto the applications row.
export async function tailorJob(accessToken, jobId, { provider, model } = {}, fetchImpl = fetch) {
  const res = await fetchImpl(`${SUPABASE_URL}/functions/v1/tailor`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ job_id: jobId, provider, model }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Tailor error ${res.status}`);
  return data;
}
