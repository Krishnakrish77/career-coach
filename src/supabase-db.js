import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-auth.js';
import { normalizeUrl, hashContent, computeCaptureQuality } from './job-utils.js';

const JOB_LIST_SELECT =
  'id,url,title,company,created_at,capture_quality,applications(status,next_follow_up_at),job_matches(overall_grade,cv_match_score,recommendation,confidence)';

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

// No versioning: each save just inserts another row, and the most recent one
// is always the source of truth. Simpler than exposing version management,
// per product decision.
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
  const rows = await restRequest(
    'resumes?select=id,raw_text,created_at&order=created_at.desc&limit=1',
    accessToken,
    {},
    fetchImpl,
  );
  return rows[0] || null;
}

// PRD 2: preferences are deliberately stored on the user's existing private
// profile row. `merge-duplicates` keeps this safe whether onboarding created a
// profile already or not.
export async function getProfilePreferences(accessToken, fetchImpl = fetch) {
  const rows = await restRequest(
    'profiles?select=target_titles,title_aliases,target_locations,remote_preference,salary_min,industries,seniority_targets,company_sizes,work_authorization,excluded_companies&limit=1',
    accessToken,
    {},
    fetchImpl,
  );
  return rows[0] || null;
}

export async function saveProfilePreferences(accessToken, preferences, fetchImpl = fetch) {
  const [profile] = await restRequest(
    'profiles?on_conflict=user_id',
    accessToken,
    {
      method: 'POST',
      body: { ...preferences, updated_at: new Date().toISOString() },
      extraHeaders: { prefer: 'resolution=merge-duplicates,return=representation' },
    },
    fetchImpl,
  );
  return profile;
}

export async function saveOpportunityScorecard(accessToken, jobId, scorecard, fetchImpl = fetch) {
  const byKey = Object.fromEntries(scorecard.factors.map((factor) => [factor.key, factor]));
  const [match] = await restRequest(
    'job_matches?on_conflict=user_id,job_id',
    accessToken,
    {
      method: 'POST',
      body: {
        job_id: jobId,
        opportunity_score: scorecard.overall_score,
        must_have_fit_score: byKey.must_have_skills?.score,
        level_fit_score: byKey.seniority_fit?.score,
        location_fit_score: byKey.location_fit?.score,
        compensation_fit_score: byKey.compensation_fit?.score,
        job_quality_score: byKey.job_quality?.score,
        recommendation: scorecard.recommendation,
        confidence: scorecard.confidence,
        score_explanation: scorecard,
      },
      extraHeaders: { prefer: 'resolution=merge-duplicates,return=representation' },
    },
    fetchImpl,
  );
  return match;
}

export async function addJobFeedback(accessToken, jobId, { actionTaken, reason }, fetchImpl = fetch) {
  const [feedback] = await restRequest(
    'job_feedback',
    accessToken,
    { method: 'POST', body: { job_id: jobId, action_taken: actionTaken, reason: reason || null }, extraHeaders: { prefer: 'return=representation' } },
    fetchImpl,
  );
  return feedback;
}

export async function listDiscoveryRecommendations(accessToken, fetchImpl = fetch) {
  return restRequest('job_recommendations?select=*,discovered_jobs(*)&order=updated_at.desc&limit=100', accessToken, {}, fetchImpl);
}

export async function importDiscoveredJob(accessToken, job, recommendation, fetchImpl = fetch) {
  const normalized_url = normalizeUrl(job.source_url);
  const content_hash = await hashContent(job.jd_text);
  const [discovered] = await restRequest('discovered_jobs?on_conflict=user_id,normalized_url', accessToken, {
    method: 'POST', body: { ...job, normalized_url, content_hash, last_seen_at: new Date().toISOString() },
    extraHeaders: { prefer: 'resolution=merge-duplicates,return=representation' },
  }, fetchImpl);
  const [saved] = await restRequest('job_recommendations?on_conflict=user_id,discovered_job_id', accessToken, {
    method: 'POST', body: { discovered_job_id: discovered.id, ...recommendation },
    extraHeaders: { prefer: 'resolution=merge-duplicates,return=representation' },
  }, fetchImpl);
  return { discovered, recommendation: saved };
}

export async function updateDiscoveryStatus(accessToken, recommendationId, status, fetchImpl = fetch) {
  const [recommendation] = await restRequest(`job_recommendations?id=eq.${recommendationId}`, accessToken, {
    method: 'PATCH', body: { status, updated_at: new Date().toISOString() }, extraHeaders: { prefer: 'return=representation' },
  }, fetchImpl);
  return recommendation;
}

export async function addDiscoveryFeedback(accessToken, discoveredJobId, { action, reasons = [] }, fetchImpl = fetch) {
  const sentiment = ['like', 'save', 'apply'].includes(action) ? 'positive' : 'negative';
  const [feedback] = await restRequest('job_preference_feedback', accessToken, {
    method: 'POST', body: { discovered_job_id: discoveredJobId, sentiment, action, reasons }, extraHeaders: { prefer: 'return=representation' },
  }, fetchImpl);
  return feedback;
}

// PRD 3: packets are an explicit user-created workspace; creating one never
// changes an application to submitted or writes to a third-party website.
export async function getApplicationPacket(accessToken, jobId, fetchImpl = fetch) {
  const rows = await restRequest(
    `application_packets?job_id=eq.${jobId}&select=*,application_packet_items(*),application_submissions(*)&limit=1`,
    accessToken, {}, fetchImpl,
  );
  return rows[0] || null;
}

export async function createApplicationPacket(accessToken, { jobId, resumeId, items }, fetchImpl = fetch) {
  const [packet] = await restRequest('application_packets?on_conflict=user_id,job_id', accessToken, {
    method: 'POST', body: { job_id: jobId, resume_id: resumeId || null },
    extraHeaders: { prefer: 'resolution=merge-duplicates,return=representation' },
  }, fetchImpl);
  if (items?.length) {
    await restRequest('application_packet_items?on_conflict=packet_id,item_type,label', accessToken, {
      method: 'POST', body: items.map((item) => ({ ...item, packet_id: packet.id })),
      extraHeaders: { prefer: 'resolution=ignore-duplicates' },
    }, fetchImpl);
  }
  return packet;
}

export async function updateApplicationPacketItem(accessToken, itemId, { finalContent }, fetchImpl = fetch) {
  const [item] = await restRequest(`application_packet_items?id=eq.${itemId}`, accessToken, {
    method: 'PATCH', body: { final_content: finalContent, updated_at: new Date().toISOString() }, extraHeaders: { prefer: 'return=representation' },
  }, fetchImpl);
  return item;
}

export async function submitApplicationPacket(accessToken, packetId, { confirmationText, followUpAt }, fetchImpl = fetch) {
  const [submission] = await restRequest('application_submissions?on_conflict=packet_id', accessToken, {
    method: 'POST', body: { packet_id: packetId, confirmation_text: confirmationText || null, follow_up_at: followUpAt || null },
    extraHeaders: { prefer: 'resolution=merge-duplicates,return=representation' },
  }, fetchImpl);
  await restRequest(`application_packets?id=eq.${packetId}`, accessToken, {
    method: 'PATCH', body: { status: 'submitted', updated_at: new Date().toISOString() }, extraHeaders: { prefer: 'return=representation' },
  }, fetchImpl);
  return submission;
}

// PRD 4: stories are user-confirmed preparation material. Sensitive stories
// remain private and callers deliberately exclude them from matching.
export async function listInterviewStories(accessToken, fetchImpl = fetch) {
  return restRequest('interview_stories?select=*&order=updated_at.desc&limit=100', accessToken, {}, fetchImpl);
}

export async function saveInterviewStory(accessToken, story, fetchImpl = fetch) {
  const endpoint = story.id ? `interview_stories?id=eq.${story.id}` : 'interview_stories';
  const method = story.id ? 'PATCH' : 'POST';
  const body = { ...story, updated_at: new Date().toISOString() };
  delete body.id;
  const [saved] = await restRequest(endpoint, accessToken, {
    method, body, extraHeaders: { prefer: 'return=representation' },
  }, fetchImpl);
  return saved;
}

export async function deleteInterviewStory(accessToken, storyId, fetchImpl = fetch) {
  return restRequest(`interview_stories?id=eq.${storyId}`, accessToken, { method: 'DELETE' }, fetchImpl);
}

export async function saveInterviewPrepSession(accessToken, session, fetchImpl = fetch) {
  const [saved] = await restRequest('interview_prep_sessions', accessToken, {
    method: 'POST', body: session, extraHeaders: { prefer: 'return=representation' },
  }, fetchImpl);
  return saved;
}

// PRD 5: all coaching is derived from a user's own rows; no third-party
// tracking is required.
export async function getJobSearchGoals(accessToken, fetchImpl = fetch) {
  const rows = await restRequest('job_search_goals?select=*&limit=1', accessToken, {}, fetchImpl);
  return rows[0] || null;
}

export async function saveJobSearchGoals(accessToken, goals, fetchImpl = fetch) {
  const [saved] = await restRequest('job_search_goals?on_conflict=user_id', accessToken, {
    method: 'POST', body: { ...goals, updated_at: new Date().toISOString() },
    extraHeaders: { prefer: 'resolution=merge-duplicates,return=representation' },
  }, fetchImpl);
  return saved;
}

export async function getWeeklyPlan(accessToken, week, fetchImpl = fetch) {
  const rows = await restRequest(`weekly_plans?week_start=eq.${week}&select=*,weekly_plan_items(*)`, accessToken, {}, fetchImpl);
  return rows[0] || null;
}

export async function saveWeeklyPlan(accessToken, { weekStart, summary, items }, fetchImpl = fetch) {
  const [plan] = await restRequest('weekly_plans?on_conflict=user_id,week_start', accessToken, {
    method: 'POST', body: { week_start: weekStart, summary }, extraHeaders: { prefer: 'resolution=merge-duplicates,return=representation' },
  }, fetchImpl);
  if (items?.length) await restRequest('weekly_plan_items', accessToken, {
    method: 'POST', body: items.map((item) => ({ ...item, weekly_plan_id: plan.id })), extraHeaders: { prefer: 'return=representation' },
  }, fetchImpl);
  return plan;
}

export async function updateWeeklyPlanItem(accessToken, itemId, fields, fetchImpl = fetch) {
  const [item] = await restRequest(`weekly_plan_items?id=eq.${itemId}`, accessToken, {
    method: 'PATCH', body: fields, extraHeaders: { prefer: 'return=representation' },
  }, fetchImpl);
  return item;
}

export async function listCoachingReminders(accessToken, fetchImpl = fetch) {
  return restRequest('coaching_reminders?select=*&status=in.(open,snoozed)&order=due_at.asc&limit=50', accessToken, {}, fetchImpl);
}
export async function saveCoachingReminder(accessToken, reminder, fetchImpl = fetch) {
  const [saved] = await restRequest('coaching_reminders', accessToken, { method: 'POST', body: reminder, extraHeaders: { prefer: 'return=representation' } }, fetchImpl);
  return saved;
}
export async function updateCoachingReminder(accessToken, id, fields, fetchImpl = fetch) {
  const [saved] = await restRequest(`coaching_reminders?id=eq.${id}`, accessToken, { method: 'PATCH', body: { ...fields, updated_at: new Date().toISOString() }, extraHeaders: { prefer: 'return=representation' } }, fetchImpl);
  return saved;
}
export async function getWeeklyRetrospective(accessToken, week, fetchImpl = fetch) {
  const rows = await restRequest(`weekly_retrospectives?week_start=eq.${week}&select=*&limit=1`, accessToken, {}, fetchImpl); return rows[0] || null;
}
export async function saveWeeklyRetrospective(accessToken, retrospective, fetchImpl = fetch) {
  const [saved] = await restRequest('weekly_retrospectives?on_conflict=user_id,week_start', accessToken, { method: 'POST', body: retrospective, extraHeaders: { prefer: 'resolution=merge-duplicates,return=representation' } }, fetchImpl); return saved;
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
