import { signIn, getValidSession, requestPasswordReset } from '../src/supabase-auth.js';
import { getStorage, setStorage } from '../src/storage.js';
import { listJobs, insertJob, getProfilePreferences } from '../src/supabase-db.js';
import { detectApplicationFields } from '../src/form-utils.js';
import { buildJobCapture } from '../src/capture-utils.js';

const $ = (id) => document.getElementById(id);
let session = null;
let formSuggestions = [];
let applicationProfile = {};

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

function profileValueForField(field) {
  if (field.type === 'name') return [applicationProfile.first_name, applicationProfile.last_name].filter(Boolean).join(' ');
  return applicationProfile[field.type] || '';
}

async function loadApplicationProfile() {
  if (!session) {
    applicationProfile = {};
    return;
  }
  const profile = await getProfilePreferences(session.accessToken);
  applicationProfile = profile?.application_profile || {};
}

function renderFormPreview(fields) {
  const output = $('formPreview');
  output.replaceChildren();
  const ready = fields.filter((field) => profileValueForField(field));
  const summary = document.createElement('div');
  summary.textContent = ready.length
    ? `${ready.length} saved detail${ready.length === 1 ? '' : 's'} ready to fill. Review the fields below, then choose Fill saved application details.`
    : 'No matching saved application details. Add them in Dashboard → Settings → Application details.';
  output.appendChild(summary);
  const list = document.createElement('ul');
  list.className = 'form-preview-list';
  for (const field of fields) {
    const item = document.createElement('li');
    const label = field.label || field.placeholder || field.name || field.type;
    item.textContent = `${label}: ${profileValueForField(field) ? 'ready to fill' : 'not filled'}`;
    list.appendChild(item);
  }
  output.appendChild(list);
  $('fillForm').disabled = !ready.length;
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
  if (session) {
    try {
      await loadApplicationProfile();
    } catch {
      applicationProfile = {};
    }
    renderRecentJobs();
  }
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
    await loadApplicationProfile();
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
  applicationProfile = {};
  formSuggestions = [];
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

    const [{ result: page }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const textOf = (selector) => document.querySelector(selector)?.innerText?.trim() || '';
        const descriptionSelectors = [
          ['[data-job-description]', 100],
          ['[data-testid*="job-description"]', 100],
          ['.jobs-description__content', 100],
          ['.jobs-description-content__text', 100],
          ['[class*="jobs-description"]', 90],
          ['[class*="job-description"]', 85],
          ['main article', 45],
          ['article', 35],
          ['main', 20],
        ];
        const seen = new Set();
        const descriptionCandidates = descriptionSelectors
          .map(([selector, priority]) => {
            const element = document.querySelector(selector);
            const text = element?.innerText?.trim() || '';
            if (!text || seen.has(text)) return null;
            seen.add(text);
            return { priority, text };
          })
          .filter(Boolean);
        return {
          pageTitle: document.title,
          metadata: {
            title: textOf('.job-details-jobs-unified-top-card__job-title') || textOf('.top-card-layout__title') || textOf('h1'),
            company: textOf('.job-details-jobs-unified-top-card__company-name') || textOf('.topcard__org-name-link') || textOf('[data-testid*="company"]'),
            location: textOf('.job-details-jobs-unified-top-card__bullet') || textOf('[data-testid*="location"]'),
          },
          descriptionCandidates,
          fallbackText: document.body.innerText,
        };
      },
    });
    const capture = buildJobCapture({ ...page, pageTitle: page?.pageTitle || tab.title });
    const job = await insertJob(session.accessToken, {
      url: tab.url,
      title: capture.title || tab.title,
      company: capture.company || null,
      location: capture.location || null,
      jd_text: capture.jd_text,
    });
    await renderRecentJobs();
    if (job.duplicate) {
      renderDuplicateNotice(job);
    } else {
      setStatus('captureStatus', capture.source === 'focused' ? 'Saved focused job description. Open the dashboard to tailor it.' : 'Saved with fallback page text. Review the description before tailoring.', capture.source === 'focused' ? 'success' : '');
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

// Preview first; writing is separately confirmed and only targets safe text fields.
$('previewForm').addEventListener('click', async () => {
  const output = $('formPreview'); output.textContent = 'Reading visible fields...';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https?:\/\//i.test(tab.url || '')) throw new Error('Open an application webpage first.');
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => [...document.querySelectorAll('input, textarea')].filter((el) => !el.disabled && el.type !== 'hidden').map((el) => ({ name: el.name, id: el.id, label: document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.innerText || '', placeholder: el.placeholder, tag: el.tagName.toLowerCase() })) });
    const fields = detectApplicationFields(result || []);
    formSuggestions = fields;
    if (!fields.length) {
      $('fillForm').disabled = true;
      output.textContent = 'No supported contact fields found. Career Coach does not fill files, checkboxes, custom questions, or submit buttons.';
      return;
    }
    if (!Object.keys(applicationProfile).length) await loadApplicationProfile();
    renderFormPreview(fields);
  } catch (err) { output.textContent = `Could not inspect this page: ${err.message}`; }
});

$('fillForm').addEventListener('click', async () => {
  const suggestions = formSuggestions.filter((field) => profileValueForField(field));
  if (!suggestions.length || !confirm(`Fill ${suggestions.length} reviewed saved field${suggestions.length === 1 ? '' : 's'}? This never uploads files, fills custom questions, or submits.`)) return;
  const values = Object.fromEntries(suggestions.map((field) => [field.groupKey, profileValueForField(field)]));
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const [{ result: changed }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, args: [suggestions, values], func: (fields, data) => { let count = 0; for (const field of fields) { const value = data[field.groupKey]; if (!value) continue; const el = field.id ? document.getElementById(field.id) : document.querySelector(`[name="${CSS.escape(field.name || '')}"]`); if (!el || el.type === 'file' || el.matches('button,[type=submit],[type=checkbox],[type=radio],[type=password]')) continue; el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); count += 1; } return count; } });
    $('formPreview').textContent = changed ? `Filled ${changed} reviewed field${changed === 1 ? '' : 's'}. Review every value before continuing.` : 'No field values were entered.';
  } catch (err) { $('formPreview').textContent = `Could not fill fields: ${err.message}`; }
});

$('openDashboard').addEventListener('click', () => openDashboard());

loadAccount();
