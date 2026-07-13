import { getValidSession } from '../src/supabase-auth.js';
import { getStorage, setStorage } from '../src/storage.js';
import {
  listJobs,
  getJob,
  updateJob,
  updateApplicationStatus,
  updateApplicationNotes,
  deleteJob,
  saveResume,
  getLatestResume,
  getProfilePreferences,
  saveProfilePreferences,
  saveOpportunityScorecard,
  listJobArtifacts,
  tailorJob,
  extractResumeFromPdf,
} from '../src/supabase-db.js';
import { checkResumeHealth } from '../src/job-utils.js';
import { buildOpportunityScorecard, recommendationLabel } from '../src/opportunity-utils.js';

const STATUSES = ['saved', 'applied', 'interviewing', 'offer', 'rejected'];
// Cheapest/lightest model per provider — a cost-conscious default, not a capability pick.
const DEFAULT_MODEL = { anthropic: 'claude-haiku-4-5', openai: 'gpt-4o-mini', gemini: 'gemini-2.5-flash' };
const $ = (id) => document.getElementById(id);

let session = null;
let selectedJobId = null;
let statusFilter = 'all';
let searchFilter = '';
let followUpDueOnly = false;
let profilePreferences = null;
let recommendationFilter = 'all';

function setStatusElement(el, message, kind = '') {
  el.textContent = message;
  if (kind) el.dataset.kind = kind;
  else delete el.dataset.kind;
}

function setStatus(id, message, kind = '') {
  setStatusElement($(id), message, kind);
}

function labelForStatus(status) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function applicationOf(job) {
  return (
    (job.applications && job.applications[0]) || {
      status: 'saved',
      tailored_resume: null,
      cover_letter: null,
      notes: null,
      next_follow_up_at: null,
    }
  );
}

function isFollowUpDue(application) {
  if (!application.next_follow_up_at) return false;
  return new Date(application.next_follow_up_at).getTime() <= Date.now();
}

const QUALITY_LABELS = { complete: 'Complete', partial: 'Partial', needs_review: 'Needs review' };

// 'complete' is the common case and would just be visual noise — only flag
// captures that actually need attention.
function createQualityPill(quality) {
  if (!quality || quality === 'complete') return null;
  const pill = document.createElement('span');
  pill.className = 'pill';
  pill.dataset.quality = quality;
  pill.textContent = QUALITY_LABELS[quality] || quality;
  return pill;
}

function toDateInputValue(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

function labelForArtifactType(type) {
  return type === 'cover_letter' ? 'Cover letter' : 'Tailored resume';
}

function labelWrap(text, inputEl) {
  const label = document.createElement('label');
  label.textContent = text;
  label.appendChild(inputEl);
  return label;
}

// null (not a stub object) when no score exists yet — every call site checks
// for that rather than rendering a fabricated "0%%" or empty grade.
function jobMatchOf(job) {
  return (job.job_matches && job.job_matches[0]) || null;
}

function createGradeBadge(jobMatch) {
  if (!jobMatch?.overall_grade) return null;
  const badge = document.createElement('span');
  badge.className = 'badge';
  badge.dataset.grade = jobMatch.overall_grade;
  badge.textContent = jobMatch.overall_grade;
  badge.title = `ATS match score: ${jobMatch.cv_match_score}/100`;
  return badge;
}

function emptyState(text) {
  const el = document.createElement('div');
  el.className = 'empty-state';
  el.textContent = text;
  return el;
}

function safeHttpUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}

function hostFromUrl(url) {
  const safeUrl = safeHttpUrl(url);
  if (!safeUrl) return '';
  return new URL(safeUrl).hostname.replace(/^www\./, '');
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function updateJobsSummary(total, filtered) {
  const summary = $('jobsSummary');
  if (!summary) return;

  if (total === 0) {
    summary.textContent = 'No saved jobs';
  } else if (total === filtered) {
    summary.textContent = `${total} ${total === 1 ? 'job' : 'jobs'}`;
  } else {
    summary.textContent = `${filtered} of ${total} ${total === 1 ? 'job' : 'jobs'}`;
  }
}

function createPill(status) {
  const pill = document.createElement('span');
  pill.className = 'pill';
  pill.dataset.status = status;
  pill.textContent = labelForStatus(status);
  return pill;
}

// ---- Tabs ----
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => {
      t.classList.remove('active');
      t.setAttribute('aria-selected', 'false');
    });
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
    tab.classList.add('active');
    tab.setAttribute('aria-selected', 'true');
    $(`${tab.dataset.tab}View`).classList.add('active');
  });
});

// ---- Jobs ----
// Every field below can originate from an arbitrary webpage (job.title/company,
// via the captured tab) or from LLM output (tailored_resume/cover_letter), so
// nothing here goes through innerHTML. job.url is validated to http(s) before
// ever becoming a real <a href>.
async function renderJobList() {
  const list = $('jobList');
  list.replaceChildren(emptyState('Loading jobs...'));
  $('jobsSummary').textContent = 'Loading jobs...';

  let jobs;
  try {
    jobs = await listJobs(session.accessToken);
  } catch (err) {
    list.replaceChildren(emptyState(`Could not load jobs: ${err.message}`));
    $('jobsSummary').textContent = '';
    return;
  }

  let filtered = statusFilter === 'all' ? jobs : jobs.filter((j) => applicationOf(j).status === statusFilter);
  if (searchFilter) {
    const q = searchFilter.toLowerCase();
    filtered = filtered.filter((j) => (j.title || '').toLowerCase().includes(q) || (j.company || '').toLowerCase().includes(q));
  }
  if (followUpDueOnly) {
    filtered = filtered.filter((j) => isFollowUpDue(applicationOf(j)));
  }
  if (recommendationFilter !== 'all') {
    filtered = filtered.filter((j) => jobMatchOf(j)?.recommendation === recommendationFilter);
  }
  const selectedVisible = filtered.some((job) => job.id === selectedJobId);
  if (filtered.length > 0 && !selectedVisible) selectedJobId = filtered[0].id;
  if (filtered.length === 0) selectedJobId = null;

  updateJobsSummary(jobs.length, filtered.length);
  list.innerHTML = '';

  if (filtered.length === 0) {
    list.appendChild(
      emptyState(statusFilter === 'all' ? 'No saved jobs yet.' : `No ${labelForStatus(statusFilter).toLowerCase()} jobs.`),
    );
    return;
  }

  for (const job of filtered) {
    const application = applicationOf(job);
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'job-card' + (job.id === selectedJobId ? ' selected' : '');
    card.setAttribute('aria-pressed', job.id === selectedJobId ? 'true' : 'false');

    const top = document.createElement('div');
    top.className = 'job-card-top';

    const titleBlock = document.createElement('div');
    titleBlock.className = 'grow';

    const h3 = document.createElement('h3');
    h3.className = 'job-title';
    h3.textContent = job.title || job.url || 'Untitled job';

    const company = document.createElement('div');
    company.className = 'small job-company';
    company.textContent = job.company || hostFromUrl(job.url);

    titleBlock.append(h3);
    if (company.textContent) titleBlock.appendChild(company);
    top.appendChild(titleBlock);
    const gradeBadge = createGradeBadge(jobMatchOf(job));
    if (gradeBadge) top.appendChild(gradeBadge);
    const qualityPill = createQualityPill(job.capture_quality);
    if (qualityPill) top.appendChild(qualityPill);
    top.appendChild(createPill(application.status));

    const bottom = document.createElement('div');
    bottom.className = 'job-card-bottom';

    const captured = document.createElement('span');
    captured.className = 'small';
    const capturedText = formatDateTime(job.created_at);
    captured.textContent = capturedText ? `Captured ${capturedText}` : '';

    bottom.appendChild(captured);
    card.append(top, bottom);
    card.addEventListener('click', () => {
      selectedJobId = job.id;
      renderJobList();
      renderJobDetail();
    });
    list.appendChild(card);
  }
}

function appendMeta(meta, text) {
  if (!text) return;
  const item = document.createElement('span');
  item.textContent = text;
  meta.appendChild(item);
}

async function renderJobDetail(editing = false) {
  const detail = $('jobDetail');
  if (!selectedJobId) {
    detail.replaceChildren(emptyState('Select a job, or save one from the extension popup.'));
    return;
  }

  detail.replaceChildren(emptyState('Loading job...'));

  let job;
  try {
    job = await getJob(session.accessToken, selectedJobId);
  } catch (err) {
    detail.replaceChildren(emptyState(`Could not load this job: ${err.message}`));
    return;
  }
  if (!job) {
    selectedJobId = null;
    return renderJobDetail();
  }

  // Best-effort — history is a nice-to-have, not worth failing the whole detail view over.
  let artifacts = [];
  try {
    artifacts = await listJobArtifacts(session.accessToken, job.id);
  } catch {
    artifacts = [];
  }

  const application = applicationOf(job);

  const card = document.createElement('article');
  card.className = 'panel detail-panel stack';

  const header = document.createElement('div');
  header.className = 'detail-header';

  const titleWrap = document.createElement('div');
  titleWrap.className = 'detail-title';

  const h2 = document.createElement('h2');
  const safeUrl = safeHttpUrl(job.url);
  if (safeUrl) {
    const link = document.createElement('a');
    link.href = safeUrl;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = job.title || job.url;
    h2.appendChild(link);
  } else {
    h2.textContent = job.title || job.url || 'Untitled job';
  }

  const meta = document.createElement('div');
  meta.className = 'detail-meta small';
  appendMeta(meta, job.company);
  appendMeta(meta, job.location);
  appendMeta(meta, hostFromUrl(job.url));
  const capturedText = formatDateTime(job.created_at);
  appendMeta(meta, capturedText ? `Captured ${capturedText}` : '');
  titleWrap.append(h2, meta);
  const qualityPill = createQualityPill(job.capture_quality);
  if (qualityPill) titleWrap.appendChild(qualityPill);

  const statusLabel = document.createElement('label');
  statusLabel.className = 'detail-status-label';
  statusLabel.textContent = 'Status';

  const statusSelect = document.createElement('select');
  statusSelect.id = 'detailStatus';
  for (const status of STATUSES) {
    const opt = document.createElement('option');
    opt.value = status;
    opt.textContent = labelForStatus(status);
    opt.selected = status === application.status;
    statusSelect.appendChild(opt);
  }
  statusLabel.appendChild(statusSelect);
  header.append(titleWrap, statusLabel);

  const actionsRow = document.createElement('div');
  actionsRow.className = 'detail-actions';

  const tailorBtn = document.createElement('button');
  tailorBtn.id = 'detailTailor';
  tailorBtn.className = 'primary';
  tailorBtn.type = 'button';
  tailorBtn.textContent = application.tailored_resume ? 'Refresh Tailored Draft' : 'Tailor Resume + Cover Letter';

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'subtle';
  editBtn.textContent = editing ? 'Cancel Edit' : 'Edit Details';

  const deleteBtn = document.createElement('button');
  deleteBtn.id = 'detailDelete';
  deleteBtn.className = 'danger';
  deleteBtn.type = 'button';
  deleteBtn.textContent = 'Delete';

  actionsRow.append(tailorBtn, editBtn, deleteBtn);

  const tailorStatus = document.createElement('div');
  tailorStatus.id = 'detailTailorStatus';
  tailorStatus.className = 'status-line';
  tailorStatus.setAttribute('aria-live', 'polite');

  card.append(header, actionsRow, tailorStatus);

  // RAW-3: edit bad capture fields without losing the original source URL —
  // url itself is never part of this form.
  if (editing) {
    const editSection = document.createElement('section');
    editSection.className = 'detail-section edit-fields';

    const titleInput = document.createElement('input');
    titleInput.value = job.title || '';
    titleInput.placeholder = 'Title';

    const companyInput = document.createElement('input');
    companyInput.value = job.company || '';
    companyInput.placeholder = 'Company';

    const locationInput = document.createElement('input');
    locationInput.value = job.location || '';
    locationInput.placeholder = 'Location';

    const jdTextarea = document.createElement('textarea');
    jdTextarea.value = job.jd_text || '';
    jdTextarea.placeholder = 'Job description';

    const saveEditBtn = document.createElement('button');
    saveEditBtn.type = 'button';
    saveEditBtn.className = 'primary';
    saveEditBtn.textContent = 'Save Details';

    const editStatus = document.createElement('div');
    editStatus.className = 'status-line';
    editStatus.setAttribute('aria-live', 'polite');

    saveEditBtn.addEventListener('click', async () => {
      saveEditBtn.disabled = true;
      setStatusElement(editStatus, 'Saving...');
      try {
        await updateJob(session.accessToken, job.id, {
          url: job.url,
          title: titleInput.value.trim(),
          company: companyInput.value.trim(),
          location: locationInput.value.trim(),
          jd_text: jdTextarea.value,
        });
        await renderJobList();
        await renderJobDetail(false);
      } catch (err) {
        setStatusElement(editStatus, `Error: ${err.message}`, 'error');
        saveEditBtn.disabled = false;
      }
    });

    editSection.append(
      labelWrap('Title', titleInput),
      labelWrap('Company', companyInput),
      labelWrap('Location', locationInput),
      labelWrap('Job description', jdTextarea),
      saveEditBtn,
      editStatus,
    );
    card.appendChild(editSection);
  } else {
    const jdSection = document.createElement('section');
    jdSection.className = 'detail-section';

    const jdHeader = document.createElement('div');
    jdHeader.className = 'detail-section-header';
    const jdTitle = document.createElement('h3');
    jdTitle.textContent = 'Job Description';
    jdHeader.appendChild(jdTitle);

    const jdText = document.createElement('div');
    jdText.className = 'jd-text';
    jdText.textContent = job.jd_text || 'No description captured.';

    jdSection.append(jdHeader, jdText);
    card.appendChild(jdSection);
  }

  const jobMatch = jobMatchOf(job);

  // PRD 2: scorecards stay explainable. A user explicitly triggers this
  // deterministic calculation, then it is persisted for queueing later.
  const triageSection = document.createElement('section');
  triageSection.className = 'detail-section stack';
  const triageHeader = document.createElement('div');
  triageHeader.className = 'detail-section-header';
  const triageTitle = document.createElement('h3');
  triageTitle.textContent = 'Opportunity Triage';
  const triageBtn = document.createElement('button');
  triageBtn.type = 'button';
  triageBtn.className = 'subtle';
  triageBtn.textContent = jobMatch?.score_explanation?.recommendation ? 'Refresh Triage' : 'Assess Opportunity';
  triageHeader.append(triageTitle, triageBtn);
  const triageStatus = document.createElement('div');
  triageStatus.className = 'status-line';
  const storedCard = jobMatch?.score_explanation?.factors ? jobMatch.score_explanation : null;
  const renderScorecard = (scorecard) => {
    const box = document.createElement('div');
    box.className = 'scorecard stack compact';
    const summary = document.createElement('div');
    summary.textContent = `${recommendationLabel(scorecard.recommendation)} · ${scorecard.overall_score}/100 · ${scorecard.confidence} confidence`;
    box.appendChild(summary);
    for (const factor of scorecard.factors) {
      const line = document.createElement('div');
      line.className = 'small';
      line.textContent = `${factor.label}: ${factor.score}/100 (${factor.confidence}) — ${factor.explanation}`;
      box.appendChild(line);
    }
    const concerns = scorecard.quality?.concerns || [];
    if (concerns.length) {
      const line = document.createElement('div');
      line.className = 'small';
      line.textContent = `Review: ${concerns.slice(0, 3).join(' ')}`;
      box.appendChild(line);
    }
    return box;
  };
  if (storedCard) triageSection.append(triageHeader, renderScorecard(storedCard));
  else triageSection.append(triageHeader, document.createTextNode('Assess fit, risk signals, and a suggested next step.'));
  triageSection.appendChild(triageStatus);
  triageBtn.addEventListener('click', async () => {
    triageBtn.disabled = true;
    setStatusElement(triageStatus, 'Assessing...');
    try {
      if (!profilePreferences) profilePreferences = (await getProfilePreferences(session.accessToken)) || {};
      const scorecard = buildOpportunityScorecard({ job, match: jobMatch || {}, preferences: profilePreferences });
      await saveOpportunityScorecard(session.accessToken, job.id, scorecard);
      await renderJobList();
      await renderJobDetail(editing);
    } catch (err) {
      setStatusElement(triageStatus, `Error: ${err.message}`, 'error');
      triageBtn.disabled = false;
    }
  });
  card.appendChild(triageSection);

  if (jobMatch) {
    const atsSection = document.createElement('section');
    atsSection.className = 'detail-section';

    const atsHeader = document.createElement('div');
    atsHeader.className = 'detail-section-header';
    const atsTitle = document.createElement('h3');
    atsTitle.textContent = 'ATS Match';
    atsHeader.appendChild(atsTitle);
    const atsBadge = createGradeBadge(jobMatch);
    if (atsBadge) atsHeader.appendChild(atsBadge);

    const scoreLine = document.createElement('div');
    scoreLine.className = 'small';
    scoreLine.textContent = jobMatch.cv_match_score != null
      ? `${jobMatch.cv_match_score}/100${jobMatch.reasoning ? ' — ' + jobMatch.reasoning : ''}`
      : 'Not scored yet.';

    atsSection.append(atsHeader, scoreLine);

    if (jobMatch.matched_skills?.length) {
      const matched = document.createElement('div');
      matched.className = 'small';
      const label = document.createElement('strong');
      label.textContent = 'Matched: ';
      matched.append(label, document.createTextNode(jobMatch.matched_skills.join(', ')));
      atsSection.appendChild(matched);
    }
    if (jobMatch.missing_skills?.length) {
      const missing = document.createElement('div');
      missing.className = 'small';
      const label = document.createElement('strong');
      label.textContent = 'Missing: ';
      missing.append(label, document.createTextNode(jobMatch.missing_skills.join(', ')));
      atsSection.appendChild(missing);
    }

    card.appendChild(atsSection);
  }

  if (application.tailored_resume) {
    const outputSection = document.createElement('section');
    outputSection.className = 'detail-section';

    const outputHeader = document.createElement('div');
    outputHeader.className = 'detail-section-header';
    const outputTitle = document.createElement('h3');
    outputTitle.textContent = 'Tailored Output';

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'subtle';
    copyBtn.textContent = 'Copy';
    outputHeader.append(outputTitle, copyBtn);

    const output = document.createElement('textarea');
    output.id = 'detailOutput';
    output.className = 'detail-output';
    output.readOnly = true;
    output.value = `TAILORED RESUME\n\n${application.tailored_resume}\n\nCOVER LETTER\n\n${application.cover_letter || ''}`;

    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(output.value);
        setStatusElement(tailorStatus, 'Copied.', 'success');
      } catch (err) {
        setStatusElement(tailorStatus, `Could not copy: ${err.message}`, 'error');
      }
    });

    outputSection.append(outputHeader, output);
    card.appendChild(outputSection);
  }

  // RAW-6/RAW-7: past generations, kept separate from the current output above.
  if (artifacts.length > 0) {
    const historySection = document.createElement('section');
    historySection.className = 'detail-section';

    const historyHeader = document.createElement('div');
    historyHeader.className = 'detail-section-header';
    const historyTitle = document.createElement('h3');
    historyTitle.textContent = 'History';
    historyHeader.appendChild(historyTitle);
    historySection.appendChild(historyHeader);

    for (const artifact of artifacts) {
      const item = document.createElement('div');
      item.className = 'artifact-item';

      const itemHeader = document.createElement('div');
      itemHeader.className = 'artifact-item-header';

      const itemLabel = document.createElement('span');
      itemLabel.className = 'small';
      const when = formatDateTime(artifact.created_at);
      itemLabel.textContent =
        `${labelForArtifactType(artifact.artifact_type)}` +
        `${when ? ' — ' + when : ''}${artifact.model ? ' (' + artifact.model + ')' : ''}`;

      const copyArtifactBtn = document.createElement('button');
      copyArtifactBtn.type = 'button';
      copyArtifactBtn.className = 'subtle';
      copyArtifactBtn.textContent = 'Copy';
      copyArtifactBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(artifact.content);
          setStatusElement(tailorStatus, 'Copied.', 'success');
        } catch (err) {
          setStatusElement(tailorStatus, `Could not copy: ${err.message}`, 'error');
        }
      });

      itemHeader.append(itemLabel, copyArtifactBtn);
      item.appendChild(itemHeader);
      historySection.appendChild(item);
    }

    card.appendChild(historySection);
  }

  // RAW-8: follow-up tracking, so applied jobs don't decay silently.
  const notesSection = document.createElement('section');
  notesSection.className = 'detail-section stack';

  const notesHeader = document.createElement('div');
  notesHeader.className = 'detail-section-header';
  const notesTitle = document.createElement('h3');
  notesTitle.textContent = 'Notes & Follow-up';
  notesHeader.appendChild(notesTitle);

  const notesTextarea = document.createElement('textarea');
  notesTextarea.value = application.notes || '';
  notesTextarea.placeholder = 'Notes...';

  const followUpInput = document.createElement('input');
  followUpInput.type = 'date';
  followUpInput.value = toDateInputValue(application.next_follow_up_at);

  const saveNotesBtn = document.createElement('button');
  saveNotesBtn.type = 'button';
  saveNotesBtn.className = 'primary';
  saveNotesBtn.textContent = 'Save Notes';

  const notesStatus = document.createElement('div');
  notesStatus.className = 'status-line';
  notesStatus.setAttribute('aria-live', 'polite');

  saveNotesBtn.addEventListener('click', async () => {
    saveNotesBtn.disabled = true;
    setStatusElement(notesStatus, 'Saving...');
    try {
      const nextFollowUpAt = followUpInput.value ? new Date(followUpInput.value).toISOString() : null;
      await updateApplicationNotes(session.accessToken, job.id, { notes: notesTextarea.value, nextFollowUpAt });
      setStatusElement(notesStatus, 'Saved.', 'success');
      await renderJobList();
    } catch (err) {
      setStatusElement(notesStatus, `Error: ${err.message}`, 'error');
    } finally {
      saveNotesBtn.disabled = false;
    }
  });

  notesSection.append(notesHeader, notesTextarea, labelWrap('Next follow-up', followUpInput), saveNotesBtn, notesStatus);
  card.appendChild(notesSection);

  detail.replaceChildren(card);

  statusSelect.addEventListener('change', async (e) => {
    const previous = application.status;
    const next = e.target.value;
    if (next === previous) return;

    statusSelect.disabled = true;
    setStatusElement(tailorStatus, 'Saving status...');
    try {
      await updateApplicationStatus(session.accessToken, job.id, next);
      application.status = next;
      await renderJobList();
      if (selectedJobId !== job.id) {
        await renderJobDetail();
      } else {
        setStatusElement(tailorStatus, 'Status updated.', 'success');
        setTimeout(() => setStatusElement(tailorStatus, ''), 1500);
      }
    } catch (err) {
      setStatusElement(tailorStatus, `Error: ${err.message}`, 'error');
      statusSelect.value = previous;
    } finally {
      statusSelect.disabled = false;
    }
  });

  editBtn.addEventListener('click', () => renderJobDetail(!editing));

  deleteBtn.addEventListener('click', async () => {
    if (!confirm('Delete this job?')) return;

    deleteBtn.disabled = true;
    setStatusElement(tailorStatus, 'Deleting...');
    try {
      await deleteJob(session.accessToken, job.id);
      selectedJobId = null;
      await renderJobList();
      await renderJobDetail();
    } catch (err) {
      setStatusElement(tailorStatus, `Error: ${err.message}`, 'error');
      deleteBtn.disabled = false;
    }
  });

  tailorBtn.addEventListener('click', async () => {
    tailorBtn.disabled = true;
    setStatusElement(tailorStatus, 'Generating...');
    try {
      const { settings } = await getStorage('settings');
      await tailorJob(session.accessToken, job.id, settings || {});
      setStatusElement(tailorStatus, 'Done.', 'success');
      await renderJobDetail();
    } catch (err) {
      setStatusElement(tailorStatus, `Error: ${err.message}`, 'error');
      tailorBtn.disabled = false;
    }
  });
}

function populateStatusFilter() {
  const filter = $('filterStatus');
  filter.innerHTML = '';

  const all = document.createElement('option');
  all.value = 'all';
  all.textContent = 'All statuses';
  filter.appendChild(all);

  for (const status of STATUSES) {
    const option = document.createElement('option');
    option.value = status;
    option.textContent = labelForStatus(status);
    filter.appendChild(option);
  }
}

populateStatusFilter();
$('filterStatus').addEventListener('change', async (e) => {
  statusFilter = e.target.value;
  await renderJobList();
  await renderJobDetail();
});

let searchDebounceTimer = null;
$('filterSearch').addEventListener('input', (e) => {
  searchFilter = e.target.value.trim();
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(async () => {
    await renderJobList();
    await renderJobDetail();
  }, 250);
});

$('filterFollowUpDue').addEventListener('change', async (e) => {
  followUpDueOnly = e.target.checked;
  await renderJobList();
  await renderJobDetail();
});

$('filterRecommendation').addEventListener('change', async (e) => {
  recommendationFilter = e.target.value;
  await renderJobList();
  await renderJobDetail();
});

// ---- Resume ----
// No versioning: the most recently saved resume is always what tailoring
// uses. Health check is still shown so bad captures get flagged either way.
function renderHealthCheck(text) {
  const container = $('resumeHealthStatus');
  container.replaceChildren();
  for (const issue of checkResumeHealth(text)) {
    const line = document.createElement('div');
    line.className = 'health-issue';
    line.textContent = issue;
    container.appendChild(line);
  }
}

async function loadResume() {
  try {
    const resume = await getLatestResume(session.accessToken);
    $('resumeText').value = resume ? resume.raw_text : '';
    renderHealthCheck($('resumeText').value);
  } catch (err) {
    setStatus('resumeStatus', `Error: ${err.message}`, 'error');
  }
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // dataURL is "data:application/pdf;base64,<payload>" — the API wants
      // just the payload.
      const base64 = String(reader.result).split(',')[1] || '';
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error || new Error('Could not read the file.'));
    reader.readAsDataURL(file);
  });
}

$('resumeText').addEventListener('blur', (e) => renderHealthCheck(e.target.value));

$('resumePdfInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  if (file.type !== 'application/pdf') {
    setStatus('resumePdfStatus', 'Please choose a PDF file.', 'error');
    e.target.value = '';
    return;
  }

  setStatus('resumePdfStatus', 'Extracting text from PDF...');
  try {
    const base64 = await readFileAsBase64(file);
    const rawText = await extractResumeFromPdf(session.accessToken, base64);
    $('resumeText').value = rawText;
    renderHealthCheck(rawText);
    setStatus('resumePdfStatus', 'Extracted — review below, then click Save Resume.', 'success');
  } catch (err) {
    setStatus('resumePdfStatus', `Error: ${err.message}`, 'error');
  } finally {
    e.target.value = '';
  }
});

$('saveResume').addEventListener('click', async () => {
  const btn = $('saveResume');
  btn.disabled = true;
  setStatus('resumeStatus', 'Saving...');
  try {
    await saveResume(session.accessToken, $('resumeText').value);
    setStatus('resumeStatus', 'Saved.', 'success');
    setTimeout(() => setStatus('resumeStatus', ''), 1500);
  } catch (err) {
    setStatus('resumeStatus', `Error: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
  }
});

// ---- Settings (provider/model preference only; API keys live server-side now) ----
function csvValues(value) {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

async function loadPreferences() {
  try {
    profilePreferences = (await getProfilePreferences(session.accessToken)) || {};
    $('targetTitles').value = (profilePreferences.target_titles || []).join(', ');
    $('remotePreference').value = profilePreferences.remote_preference || '';
    $('workAuthorization').value = profilePreferences.work_authorization || '';
    $('salaryMin').value = profilePreferences.salary_min ?? '';
    $('excludedCompanies').value = (profilePreferences.excluded_companies || []).join(', ');
  } catch (err) {
    setStatus('preferencesStatus', `Error: ${err.message}`, 'error');
  }
}

$('savePreferences').addEventListener('click', async () => {
  const btn = $('savePreferences');
  btn.disabled = true;
  setStatus('preferencesStatus', 'Saving...');
  try {
    profilePreferences = await saveProfilePreferences(session.accessToken, {
      target_titles: csvValues($('targetTitles').value),
      remote_preference: $('remotePreference').value || null,
      work_authorization: $('workAuthorization').value.trim() || null,
      salary_min: $('salaryMin').value ? Number($('salaryMin').value) : null,
      excluded_companies: csvValues($('excludedCompanies').value),
    });
    setStatus('preferencesStatus', 'Saved.', 'success');
  } catch (err) {
    setStatus('preferencesStatus', `Error: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
  }
});

async function loadSettings() {
  const { settings } = await getStorage('settings');
  $('provider').value = settings?.provider || 'anthropic';
  $('model').value = settings?.model || DEFAULT_MODEL[settings?.provider || 'anthropic'];
}

$('provider').addEventListener('change', () => {
  const current = $('model').value.trim();
  const currentIsDefault = Object.values(DEFAULT_MODEL).includes(current);
  if (!current || currentIsDefault) $('model').value = DEFAULT_MODEL[$('provider').value];
});

$('saveSettings').addEventListener('click', async () => {
  await setStorage({
    settings: { provider: $('provider').value, model: $('model').value.trim() || DEFAULT_MODEL[$('provider').value] },
  });
  setStatus('settingsStatus', 'Saved.', 'success');
  setTimeout(() => setStatus('settingsStatus', ''), 1500);
});

// ---- Init / auth gate ----
async function init() {
  const { session: stored } = await getStorage('session');
  session = stored ? await getValidSession(stored) : null;
  if (session && session !== stored) await setStorage({ session });

  if (!session) {
    $('accountStatusNav').textContent = 'Not signed in';
    document.querySelector('main').replaceChildren(emptyState('Sign in via the extension popup to use the dashboard.'));
    return;
  }

  $('accountStatusNav').textContent = `Signed in as ${session.user.email}`;
  const linkedJobId = new URLSearchParams(location.search).get('job');
  if (linkedJobId) selectedJobId = linkedJobId;
  await renderJobList();
  await renderJobDetail();
  loadResume();
  loadPreferences();
  loadSettings();
}

init();
