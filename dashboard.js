import { getValidSession } from './supabase-auth.js';
import { getStorage, setStorage } from './storage.js';
import { listJobs, updateApplicationStatus, deleteJob, saveResume, getLatestResume, tailorJob } from './supabase-db.js';

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
function badgeHtml(job) {
  // overallGrade doesn't exist yet (scoring isn't wired up) — render nothing
  // until that data shows up on the job row, rather than fake a value.
  if (!job.overall_grade) return '';
  return `<span class="badge" data-grade="${job.overall_grade}">${job.overall_grade}</span>`;
}

async function renderJobList() {
  const jobs = await listJobs(session.accessToken);
  const filtered = statusFilter === 'all' ? jobs : jobs.filter((j) => applicationOf(j).status === statusFilter);
  const list = $('jobList');
  list.innerHTML = '';

  if (filtered.length === 0) {
    list.innerHTML = `<div class="empty-state">No jobs${statusFilter === 'all' ? ' yet — capture one from the extension popup.' : ' with this status.'}</div>`;
    return;
  }

  for (const job of filtered) {
    const application = applicationOf(job);
    const el = document.createElement('div');
    el.className = 'card job-card' + (job.id === selectedJobId ? ' selected' : '');
    el.innerHTML = `
      <h3>${job.title || job.url} ${badgeHtml(job)}</h3>
      <div class="small">${job.company || ''}</div>
      <span class="pill" data-status="${application.status}">${application.status}</span>
    `;
    el.addEventListener('click', () => {
      selectedJobId = job.id;
      renderJobList();
      renderJobDetail();
    });
    list.appendChild(el);
  }
}

async function renderJobDetail() {
  const detail = $('jobDetail');
  if (!selectedJobId) {
    detail.innerHTML = `<div class="empty-state">Select a job from the list, or capture one from the extension popup.</div>`;
    return;
  }

  const jobs = await listJobs(session.accessToken);
  const job = jobs.find((j) => j.id === selectedJobId);
  if (!job) {
    selectedJobId = null;
    return renderJobDetail();
  }
  const application = applicationOf(job);

  detail.innerHTML = `
    <div class="card stack">
      <div class="row">
        <h2><a href="${job.url}" target="_blank" rel="noopener">${job.title || job.url}</a></h2>
        <select id="detailStatus" style="max-width: 160px;">
          ${STATUSES.map((s) => `<option value="${s}" ${s === application.status ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>
      <div class="small">Captured ${new Date(job.created_at).toLocaleString()}</div>
      <div class="jd-text">${job.jd_text || ''}</div>
      <div class="row">
        <button id="detailTailor" class="primary">${application.tailored_resume ? 'Re-tailor' : 'Tailor resume + cover letter'}</button>
        <button id="detailDelete" class="danger">Delete</button>
      </div>
      <div id="detailTailorStatus" class="small"></div>
      <textarea id="detailOutput" readonly style="${application.tailored_resume ? '' : 'display:none'}">${
        application.tailored_resume ? `TAILORED RESUME\n\n${application.tailored_resume}\n\nCOVER LETTER\n\n${application.cover_letter}` : ''
      }</textarea>
    </div>
  `;

  $('detailStatus').addEventListener('change', async (e) => {
    await updateApplicationStatus(session.accessToken, job.id, e.target.value);
    renderJobList();
  });

  $('detailDelete').addEventListener('click', async () => {
    await deleteJob(session.accessToken, job.id);
    selectedJobId = null;
    renderJobList();
    renderJobDetail();
  });

  $('detailTailor').addEventListener('click', async () => {
    const statusEl = $('detailTailorStatus');
    statusEl.textContent = 'Generating…';
    try {
      const { settings } = await getStorage('settings');
      await tailorJob(session.accessToken, job.id, settings || {});
      statusEl.textContent = 'Done.';
      renderJobDetail();
    } catch (err) {
      statusEl.textContent = `Error: ${err.message}`;
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
  await saveResume(session.accessToken, $('resumeText').value);
  $('resumeStatus').textContent = 'Saved.';
  setTimeout(() => ($('resumeStatus').textContent = ''), 1500);
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
