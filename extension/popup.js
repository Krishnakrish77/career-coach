import { signIn, getValidSession, requestPasswordReset } from '../src/supabase-auth.js';
import { getStorage, setStorage } from '../src/storage.js';
import { listJobs, insertJob } from '../src/supabase-db.js';

const $ = (id) => document.getElementById(id);
let session = null;

function setStatus(id, message, kind = '') {
  const el = $(id);
  el.textContent = message;
  if (kind) el.dataset.kind = kind;
  else delete el.dataset.kind;
}

function accountInitial(email) {
  return (email || '?').trim().charAt(0).toUpperCase() || '?';
}

function hostFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function popupEmptyState(text) {
  const el = document.createElement('div');
  el.className = 'empty-state popup-empty';
  el.textContent = text;
  return el;
}

function openDashboard(jobId) {
  const url = jobId
    ? chrome.runtime.getURL(`extension/dashboard.html?job=${encodeURIComponent(jobId)}`)
    : chrome.runtime.getURL('extension/dashboard.html');
  chrome.tabs.create({ url });
}

// RAW-1: link straight to the existing job instead of just saying "duplicate".
function renderDuplicateNotice(job) {
  const el = $('captureStatus');
  el.textContent = '';
  delete el.dataset.kind;
  el.append('Already saved — ');
  const link = document.createElement('a');
  link.href = '#';
  link.textContent = 'open it in the dashboard';
  link.addEventListener('click', (e) => {
    e.preventDefault();
    openDashboard(job.id);
  });
  el.appendChild(link);
}

// ---- Account ----
function renderAccount() {
  $('accountSignedOut').style.display = session ? 'none' : '';
  $('accountSignedIn').style.display = session ? '' : 'none';
  $('signedInActions').style.display = session ? '' : 'none';

  if (session) {
    $('accountEmail').textContent = session.user.email;
    $('accountInitial').textContent = accountInitial(session.user.email);
  } else {
    $('recentJobs').innerHTML = '';
  }
}

async function loadAccount() {
  const { session: stored } = await getStorage('session');
  if (!stored) {
    session = null;
    renderAccount();
    return;
  }

  // Refresh eagerly on popup open so a stale token does not surface as a
  // confusing 401 the first time something tries to use it.
  session = await getValidSession(stored);
  if (session !== stored) await setStorage({ session });
  renderAccount();
  if (session) renderRecentJobs();
}

async function handleAuth(action, statusVerb) {
  const email = $('authEmail').value.trim();
  const password = $('authPassword').value;
  if (!email || !password) {
    setStatus('accountStatus', 'Enter an email and password.', 'error');
    return;
  }

  setStatus('accountStatus', `${statusVerb}...`);
  try {
    const result = await action(email, password);
    if (result.pendingConfirmation) {
      setStatus('accountStatus', 'Check your email to confirm your account, then log in.', 'success');
      return;
    }
    session = result;
    await setStorage({ session });
    $('authPassword').value = '';
    setStatus('accountStatus', '');
    renderAccount();
    renderRecentJobs();
  } catch (err) {
    setStatus('accountStatus', `Error: ${err.message}`, 'error');
  }
}

$('signIn').addEventListener('click', () => handleAuth(signIn, 'Logging in'));

$('forgotPassword').addEventListener('click', async () => {
  const email = $('authEmail').value.trim();
  if (!email) {
    setStatus('accountStatus', 'Enter your email first.', 'error');
    return;
  }
  setStatus('accountStatus', 'Sending reset email...');
  try {
    await requestPasswordReset(email);
    setStatus('accountStatus', 'Check your email for a password reset link.', 'success');
  } catch (err) {
    setStatus('accountStatus', `Error: ${err.message}`, 'error');
  }
});

$('signOut').addEventListener('click', async () => {
  await setStorage({ session: null });
  session = null;
  setStatus('accountStatus', '');
  setStatus('captureStatus', '');
  renderAccount();
});

// ---- Recent captures (read-only preview; full list lives in the dashboard) ----
// job.title comes from the captured tab's <title>: arbitrary, untrusted web
// content. Dynamic fields here are set via textContent/dataset, never
// interpolated into innerHTML.
async function renderRecentJobs() {
  const list = $('recentJobs');
  list.innerHTML = '';
  list.appendChild(popupEmptyState('Loading jobs...'));

  let jobs;
  try {
    jobs = await listJobs(session.accessToken);
  } catch (err) {
    list.innerHTML = '';
    list.appendChild(popupEmptyState(`Could not load jobs: ${err.message}`));
    return;
  }

  list.innerHTML = '';
  if (jobs.length === 0) {
    list.appendChild(popupEmptyState('No saved jobs yet.'));
    return;
  }

  for (const job of jobs.slice(0, 3)) {
    const status = (job.applications && job.applications[0]?.status) || 'saved';

    const card = document.createElement('div');
    card.className = 'mini-job';

    const title = document.createElement('div');
    title.className = 'mini-job-title';
    title.textContent = job.title || job.url || 'Untitled job';

    const meta = document.createElement('div');
    meta.className = 'mini-job-meta';

    const host = document.createElement('span');
    host.className = 'small';
    host.textContent = job.company || hostFromUrl(job.url);

    const pill = document.createElement('span');
    pill.className = 'pill';
    pill.dataset.status = status;
    pill.textContent = status;

    meta.append(host, pill);
    card.append(title, meta);
    list.appendChild(card);
  }
}

$('captureJob').addEventListener('click', async () => {
  const btn = $('captureJob');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Saving...';
  btn.setAttribute('aria-busy', 'true');
  setStatus('captureStatus', 'Reading current tab...');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      setStatus('captureStatus', 'No active tab found.', 'error');
      return;
    }
    if (!/^https?:\/\//i.test(tab.url || '')) {
      setStatus('captureStatus', 'Open a webpage before saving a job.', 'error');
      return;
    }

    const [{ result: pageText }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => document.body.innerText,
    });
    const job = await insertJob(session.accessToken, {
      url: tab.url,
      title: tab.title,
      company: null,
      jd_text: String(pageText || '').slice(0, 12000),
    });
    await renderRecentJobs();
    if (job.duplicate) {
      renderDuplicateNotice(job);
    } else {
      setStatus('captureStatus', 'Saved. Open the dashboard to tailor it.', 'success');
      setTimeout(() => setStatus('captureStatus', ''), 2500);
    }
  } catch (err) {
    setStatus('captureStatus', `Error: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
    btn.removeAttribute('aria-busy');
  }
});

$('openDashboard').addEventListener('click', () => openDashboard());

loadAccount();
