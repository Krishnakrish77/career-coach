import { getValidSession } from './supabase-auth.js';
import { getStorage, setStorage } from './storage.js';
import { listJobs, getJob, updateApplicationStatus, deleteJob, saveResume, getLatestResume, tailorJob } from './supabase-db.js';

const STATUSES = ['saved', 'applied', 'interviewing', 'offer', 'rejected'];
const DEFAULT_MODEL = { anthropic: 'claude-opus-4-8', openai: 'gpt-4o', gemini: 'gemini-2.5-pro' };
const $ = (id) => document.getElementById(id);

let session = null;
let selectedJobId = null;
let statusFilter = 'all';

function applicationOf(job) {
  return (job.applications && job.applications[0]) || { status: 'saved', tailored_resume: null, cover_letter: null };
}

// ---- Tabs ----
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
    tab.classList.add('active');
    $(`${tab.dataset.tab}View`).classList.add('active');
  });
});

// ---- Jobs ----
// Every field below can originate from an arbitrary webpage (job.title/company,
// via the captured tab) or from LLM output (tailored_resume/cover_letter), so
// nothing here goes through innerHTML — DOM nodes + textContent/.value only.
// job.url is validated to http(s) before ever becoming a real <a href>.
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

async function renderJobList() {
  const list = $('jobList');
  list.innerHTML = '';
  list.appendChild(emptyState('Loading…'));

  let jobs;
  try {
    jobs = await listJobs(session.accessToken);
  } catch (err) {
    list.innerHTML = '';
    list.appendChild(emptyState(`Couldn't load jobs: ${err.message}`));
    return;
  }

  const filtered = statusFilter === 'all' ? jobs : jobs.filter((j) => applicationOf(j).status === statusFilter);
  list.innerHTML = '';

  if (filtered.length === 0) {
    list.appendChild(
      emptyState(statusFilter === 'all' ? 'No jobs yet — capture one from the extension popup.' : 'No jobs with this status.'),
    );
    return;
  }

  for (const job of filtered) {
    const application = applicationOf(job);
    const card = document.createElement('div');
    card.className = 'card job-card' + (job.id === selectedJobId ? ' selected' : '');

    const h3 = document.createElement('h3');
    h3.textContent = job.title || job.url;

    const company = document.createElement('div');
    company.className = 'small';
    company.textContent = job.company || '';

    const pill = document.createElement('span');
    pill.className = 'pill';
    pill.dataset.status = application.status;
    pill.textContent = application.status;

    card.append(h3, company, pill);
    card.addEventListener('click', () => {
      selectedJobId = job.id;
      renderJobList();
      renderJobDetail();
    });
    list.appendChild(card);
  }
}

async function renderJobDetail() {
  const detail = $('jobDetail');
  if (!selectedJobId) {
    detail.innerHTML = '';
    detail.appendChild(emptyState('Select a job from the list, or capture one from the extension popup.'));
    return;
  }

  detail.innerHTML = '';
  detail.appendChild(emptyState('Loading…'));

  let job;
  try {
    job = await getJob(session.accessToken, selectedJobId);
  } catch (err) {
    detail.innerHTML = '';
    detail.appendChild(emptyState(`Couldn't load this job: ${err.message}`));
    return;
  }
  if (!job) {
    selectedJobId = null;
    return renderJobDetail();
  }
  const application = applicationOf(job);

  const card = document.createElement('div');
  card.className = 'card stack';

  const headerRow = document.createElement('div');
  headerRow.className = 'row';
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
    h2.textContent = job.title || job.url;
  }
  const statusSelect = document.createElement('select');
  statusSelect.id = 'detailStatus';
  statusSelect.style.maxWidth = '160px';
  for (const s of STATUSES) {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s;
    opt.selected = s === application.status;
    statusSelect.appendChild(opt);
  }
  headerRow.append(h2, statusSelect);

  const captured = document.createElement('div');
  captured.className = 'small';
  captured.textContent = `Captured ${new Date(job.created_at).toLocaleString()}`;

  const jdText = document.createElement('div');
  jdText.className = 'jd-text';
  jdText.textContent = job.jd_text || '';

  const actionsRow = document.createElement('div');
  actionsRow.className = 'row';
  const tailorBtn = document.createElement('button');
  tailorBtn.id = 'detailTailor';
  tailorBtn.className = 'primary';
  tailorBtn.textContent = application.tailored_resume ? 'Re-tailor' : 'Tailor resume + cover letter';
  const deleteBtn = document.createElement('button');
  deleteBtn.id = 'detailDelete';
  deleteBtn.className = 'danger';
  deleteBtn.textContent = 'Delete';
  actionsRow.append(tailorBtn, deleteBtn);

  const tailorStatus = document.createElement('div');
  tailorStatus.id = 'detailTailorStatus';
  tailorStatus.className = 'small';

  const output = document.createElement('textarea');
  output.id = 'detailOutput';
  output.readOnly = true;
  output.style.display = application.tailored_resume ? '' : 'none';
  output.value = application.tailored_resume
    ? `TAILORED RESUME\n\n${application.tailored_resume}\n\nCOVER LETTER\n\n${application.cover_letter}`
    : '';

  card.append(headerRow, captured, jdText, actionsRow, tailorStatus, output);
  detail.appendChild(card);

  statusSelect.addEventListener('change', async (e) => {
    const previous = application.status;
    statusSelect.disabled = true;
    try {
      await updateApplicationStatus(session.accessToken, job.id, e.target.value);
      renderJobList();
    } catch (err) {
      tailorStatus.textContent = `Error: ${err.message}`;
      statusSelect.value = previous;
    } finally {
      statusSelect.disabled = false;
    }
  });

  deleteBtn.addEventListener('click', async () => {
    deleteBtn.disabled = true;
    try {
      await deleteJob(session.accessToken, job.id);
      selectedJobId = null;
      renderJobList();
      renderJobDetail();
    } catch (err) {
      tailorStatus.textContent = `Error: ${err.message}`;
      deleteBtn.disabled = false;
    }
  });

  tailorBtn.addEventListener('click', async () => {
    tailorBtn.disabled = true;
    tailorStatus.textContent = 'Generating…';
    try {
      const { settings } = await getStorage('settings');
      await tailorJob(session.accessToken, job.id, settings || {});
      tailorStatus.textContent = 'Done.';
      renderJobDetail();
    } catch (err) {
      tailorStatus.textContent = `Error: ${err.message}`;
      tailorBtn.disabled = false;
    }
  });
}

$('filterStatus').innerHTML =
  `<option value="all">All statuses</option>` +
  STATUSES.map((s) => `<option value="${s}">${s}</option>`).join('');
$('filterStatus').addEventListener('change', (e) => {
  statusFilter = e.target.value;
  renderJobList();
});

// ---- Resume ----
async function loadResume() {
  const resume = await getLatestResume(session.accessToken);
  $('resumeText').value = resume ? resume.raw_text : '';
}
$('saveResume').addEventListener('click', async () => {
  const btn = $('saveResume');
  btn.disabled = true;
  $('resumeStatus').textContent = 'Saving…';
  try {
    await saveResume(session.accessToken, $('resumeText').value);
    $('resumeStatus').textContent = 'Saved.';
    setTimeout(() => ($('resumeStatus').textContent = ''), 1500);
  } catch (err) {
    $('resumeStatus').textContent = `Error: ${err.message}`;
  } finally {
    btn.disabled = false;
  }
});

// ---- Settings (provider/model preference only — API keys live server-side now) ----
async function loadSettings() {
  const { settings } = await getStorage('settings');
  $('provider').value = settings?.provider || 'anthropic';
  $('model').value = settings?.model || DEFAULT_MODEL[settings?.provider || 'anthropic'];
}
$('provider').addEventListener('change', () => {
  if (!$('model').value) $('model').value = DEFAULT_MODEL[$('provider').value];
});
$('saveSettings').addEventListener('click', async () => {
  await setStorage({
    settings: { provider: $('provider').value, model: $('model').value.trim() || DEFAULT_MODEL[$('provider').value] },
  });
  $('settingsStatus').textContent = 'Saved.';
  setTimeout(() => ($('settingsStatus').textContent = ''), 1500);
});

// ---- Init / auth gate ----
async function init() {
  const { session: stored } = await getStorage('session');
  session = stored ? await getValidSession(stored) : null;
  if (session && session !== stored) await setStorage({ session });

  if (!session) {
    $('accountStatusNav').textContent = 'Not signed in';
    document.querySelector('main').innerHTML =
      `<div class="empty-state">Sign in via the extension popup to use the dashboard.</div>`;
    return;
  }

  $('accountStatusNav').textContent = `Signed in as ${session.user.email}`;
  renderJobList();
  renderJobDetail();
  loadResume();
  loadSettings();
}

init();
