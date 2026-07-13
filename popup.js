import { signUp, signIn, getValidSession } from './supabase-auth.js';
import { getStorage, setStorage } from './storage.js';
import { listJobs, insertJob } from './supabase-db.js';

const $ = (id) => document.getElementById(id);
let session = null;

// ---- Account ----
function renderAccount() {
  $('accountSignedOut').style.display = session ? 'none' : '';
  $('accountSignedIn').style.display = session ? '' : 'none';
  $('signedInActions').style.display = session ? '' : 'none';
  if (session) $('accountEmail').textContent = session.user.email;
}

async function loadAccount() {
  const { session: stored } = await getStorage('session');
  if (!stored) {
    session = null;
    renderAccount();
    return;
  }
  // Refresh eagerly on popup open so a stale token doesn't surface as a
  // confusing 401 the first time something tries to use it.
  session = await getValidSession(stored);
  if (session !== stored) await setStorage({ session });
  renderAccount();
  if (session) renderRecentJobs();
}

async function handleAuth(action, statusVerb) {
  const email = $('authEmail').value.trim();
  const password = $('authPassword').value;
  $('accountStatus').textContent = `${statusVerb}…`;
  try {
    session = await action(email, password);
    await setStorage({ session });
    $('authPassword').value = '';
    $('accountStatus').textContent = '';
    renderAccount();
    renderRecentJobs();
  } catch (err) {
    $('accountStatus').textContent = `Error: ${err.message}`;
  }
}

$('signIn').addEventListener('click', () => handleAuth(signIn, 'Logging in'));
$('signUp').addEventListener('click', () => handleAuth(signUp, 'Signing up'));
$('signOut').addEventListener('click', async () => {
  await setStorage({ session: null });
  session = null;
  renderAccount();
});

// ---- Recent captures (read-only preview; full list lives in the dashboard) ----
// job.title comes from the captured tab's <title> — arbitrary, untrusted web
// content — so every dynamic field here is set via textContent/dataset, never
// interpolated into innerHTML.
async function renderRecentJobs() {
  const jobs = await listJobs(session.accessToken);
  const list = $('recentJobs');
  list.innerHTML = '';
  for (const job of jobs.slice(0, 3)) {
    const status = (job.applications && job.applications[0]?.status) || 'saved';

    const card = document.createElement('div');
    card.className = 'card';
    card.style.padding = '6px 8px';

    const title = document.createElement('div');
    title.className = 'small';
    title.style.color = 'var(--text)';
    title.textContent = job.title || job.url;

    const pill = document.createElement('span');
    pill.className = 'pill';
    pill.dataset.status = status;
    pill.textContent = status;

    card.append(title, pill);
    list.appendChild(card);
  }
}

$('captureJob').addEventListener('click', async () => {
  const btn = $('captureJob');
  btn.disabled = true;
  $('captureStatus').textContent = 'Saving…';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      $('captureStatus').textContent = 'No active tab found.';
      return;
    }
    const [{ result: pageText }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => document.body.innerText,
    });
    await insertJob(session.accessToken, {
      url: tab.url,
      title: tab.title,
      company: null,
      jd_text: pageText.slice(0, 12000),
    });
    await renderRecentJobs();
    $('captureStatus').textContent = 'Saved — open the dashboard to tailor it.';
    setTimeout(() => ($('captureStatus').textContent = ''), 2500);
  } catch (err) {
    $('captureStatus').textContent = `Error: ${err.message}`;
  } finally {
    btn.disabled = false;
  }
});

$('openDashboard').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
});

loadAccount();
