import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-auth.js';
import { normalizeUrl, hashContent, computeCaptureQuality } from './job-utils.js';

const JOB_LIST_SELECT =
  'id,url,title,company,created_at,capture_quality,applications(status,next_follow_up_at),job_matches(overall_grade,cv_match_score)';

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

function unwrapRpcResult(result) {
  return Array.isArray(result) ? result[0] : result;
}

async function getDuplicateByExactUrl(accessToken, url, fetchImpl) {
  const rows = await restRequest(
    `jobs?url=eq.${encodeURIComponent(url)}&select=${JOB_LIST_SELECT}&limit=1`,
    accessToken,
    {},
    fetchImpl,
  );
  const existing = rows[0] || null;
  return existing?.applications?.length ? existing : null;
}

async function activateResumeVersionRpc(accessToken, resumeId, fetchImpl) {
  const result = await restRequest(
    'rpc/activate_resume_version',
    accessToken,
    { method: 'POST', body: { p_resume_id: resumeId } },
    fetchImpl,
  );
  return unwrapRpcResult(result);
}

// Light projection for list rendering — no jd_text/tailored_resume/cover_letter,
// since those aren't needed until a specific job is opened (see getJob below).
// limit=100 is a sane ceiling for personal-scale use today; add real
// pagination if usage grows past it rather than raising this silently.
export async function listJobs(accessToken, fetchImpl = fetch) {
  return restRequest(
    `jobs?select=${JOB_LIST_SELECT}&order=created_at.desc&limit=100`,
    accessToken,
    {},
    fetchImpl,
  );
}

// Full row (including jd_text/tailored_resume/cover_letter) for one job —
// used by the detail view instead of re-fetching and re-scanning the whole list.
export async function getJob(accessToken, jobId, fetchImpl = fetch) {
  const rows = await restRequest(`jobs?id=eq.${jobId}&select=*,applications(*),job_matches(*)`, accessToken, {}, fetchImpl);
  return rows[0] || null;
}

// Creates the job row, then its paired applications row (status defaults to
// 'saved'). Two requests because a job can exist without belonging to the
// caller (the future shared discovery pool) — applications is what's always
// per-user, so it's always its own insert.
//
// Dedup: normalized_url is computed here and enforced by a unique index
// (user_id, normalized_url) — the client check is just to skip the extra
// round trip; the index is what actually prevents a race between two
// captures of the same posting. On conflict, fetch and return the existing
// row instead of throwing, with `duplicate: true` so the UI can point at it.
export async function insertJob(accessToken, { url, title, company, jd_text }, fetchImpl = fetch) {
  const normalized_url = normalizeUrl(url);
  const content_hash = await hashContent(jd_text);
  const capture_quality = computeCaptureQuality({ title, company, url, jd_text });

  // Compatibility for rows saved before normalized_url existed. If the exact
  // URL is already in the user's tracker, return it before inserting a second
  // row. Shared-pool rows are ignored because they have no user application.
  const existingByUrl = await getDuplicateByExactUrl(accessToken, url, fetchImpl);
  if (existingByUrl) return { ...existingByUrl, duplicate: true };

  let job;
  try {
    [job] = await restRequest(
      'jobs',
      accessToken,
      {
        method: 'POST',
        body: { url, title, company, jd_text, source: 'manual', normalized_url, content_hash, capture_quality },
        extraHeaders: { prefer: 'return=representation' },
      },
      fetchImpl,
    );
  } catch (err) {
    if (!/Supabase error 409/.test(err.message)) throw err;
    const [existing] = await restRequest(
      `jobs?normalized_url=eq.${encodeURIComponent(normalized_url)}&select=${JOB_LIST_SELECT}&limit=1`,
      accessToken,
      {},
      fetchImpl,
    );
    if (!existing) throw new Error('Duplicate job exists, but it could not be loaded.');
    return { ...existing, duplicate: true };
  }

  const [application] = await restRequest(
    'applications',
    accessToken,
    { method: 'POST', body: { job_id: job.id, status: 'saved' }, extraHeaders: { prefer: 'return=representation' } },
    fetchImpl,
  );
  return { ...job, applications: [application], duplicate: false };
}

// Editable job-detail fields (RAW-3). The source URL is never edited here —
// only fields a flaky capture might have gotten wrong — so capture_quality
// is recomputed against the caller's current url, not a new one.
export async function updateJob(accessToken, jobId, { url, title, company, location, jd_text }, fetchImpl = fetch) {
  const capture_quality = computeCaptureQuality({ title, company, url, jd_text });
  const [job] = await restRequest(
    `jobs?id=eq.${jobId}`,
    accessToken,
    { method: 'PATCH', body: { title, company, location, jd_text, capture_quality }, extraHeaders: { prefer: 'return=representation' } },
    fetchImpl,
  );
  return job;
}

async function patchApplication(accessToken, jobId, fields, fetchImpl) {
  return restRequest(
    `applications?job_id=eq.${jobId}`,
    accessToken,
    { method: 'PATCH', body: { ...fields, updated_at: new Date().toISOString() }, extraHeaders: { prefer: 'return=representation' } },
    fetchImpl,
  );
}

export async function updateApplicationStatus(accessToken, jobId, status, fetchImpl = fetch) {
  return patchApplication(accessToken, jobId, { status }, fetchImpl);
}

// Follow-up tracking (RAW-8). nextFollowUpAt is an ISO date string or null.
export async function updateApplicationNotes(accessToken, jobId, { notes, nextFollowUpAt }, fetchImpl = fetch) {
  return patchApplication(accessToken, jobId, { notes, next_follow_up_at: nextFollowUpAt }, fetchImpl);
}

export async function deleteJob(accessToken, jobId, fetchImpl = fetch) {
  // applications row cascade-deletes via the job_id foreign key.
  return restRequest(`jobs?id=eq.${jobId}`, accessToken, { method: 'DELETE' }, fetchImpl);
}

// RAW-4: resumes are versioned, with exactly one active version per user
// (enforced by a partial unique index). Activation happens through a DB RPC so
// the active-version swap is transactional.
export async function listResumeVersions(accessToken, fetchImpl = fetch) {
  return restRequest(
    'resumes?select=id,label,source_type,source_filename,is_active,created_at&order=created_at.desc',
    accessToken,
    {},
    fetchImpl,
  );
}

export async function getActiveResume(accessToken, fetchImpl = fetch) {
  const rows = await restRequest(
    'resumes?is_active=eq.true&select=id,raw_text,label,created_at&limit=1',
    accessToken,
    {},
    fetchImpl,
  );
  return rows[0] || null;
}

export async function saveResumeVersion(
  accessToken,
  { rawText, label = null, sourceType = 'text', sourceFilename = null },
  fetchImpl = fetch,
) {
  const [resume] = await restRequest(
    'resumes',
    accessToken,
    {
      method: 'POST',
      body: { raw_text: rawText, label, source_type: sourceType, source_filename: sourceFilename, is_active: false },
      extraHeaders: { prefer: 'return=representation' },
    },
    fetchImpl,
  );
  return activateResumeVersionRpc(accessToken, resume.id, fetchImpl);
}

export async function activateResumeVersion(accessToken, resumeId, fetchImpl = fetch) {
  return activateResumeVersionRpc(accessToken, resumeId, fetchImpl);
}

// RAW-6/RAW-7: history of tailoring generations for one job, newest first.
export async function listJobArtifacts(accessToken, jobId, fetchImpl = fetch) {
  return restRequest(
    `job_artifacts?job_id=eq.${jobId}&select=*&order=created_at.desc&limit=20`,
    accessToken,
    {},
    fetchImpl,
  );
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

// Calls the `extract-resume` Edge Function (PDF -> plain text via Anthropic,
// regardless of the user's tailoring provider preference — see the function's
// own comment for why). pdfBase64 should be the raw base64 payload, no
// "data:application/pdf;base64," prefix.
export async function extractResumeFromPdf(accessToken, pdfBase64, fetchImpl = fetch) {
  const res = await fetchImpl(`${SUPABASE_URL}/functions/v1/extract-resume`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ pdf_base64: pdfBase64 }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Extract error ${res.status}`);
  return data.raw_text;
}
