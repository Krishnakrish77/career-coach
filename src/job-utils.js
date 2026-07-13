// Client-side heuristics for PRD 1 (Reliable Application Workspace): dedup
// keys computed at capture time, and deterministic quality checks that don't
// need an LLM call.

const TRACKING_QUERY_PARAMS = new Set([
  'fbclid',
  'gclid',
  'igshid',
  'mc_cid',
  'mc_eid',
  'msclkid',
  'ref',
  'ref_src',
  'referrer',
  'trk',
  'yclid',
]);

function isTrackingQueryParam(name) {
  const normalized = name.toLowerCase();
  return normalized.startsWith('utm_') || TRACKING_QUERY_PARAMS.has(normalized);
}

// Strips fragment, "www.", trailing slash, and known tracking params while
// keeping meaningful query params. Some boards put the actual job id in the
// query string (e.g. jk, gh_jid, currentJobId), so dropping every param can
// collapse distinct jobs into one dedup key.
export function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    const path = parsed.pathname.replace(/\/+$/, '');
    const keptParams = Array.from(parsed.searchParams.entries())
      .filter(([name]) => !isTrackingQueryParam(name))
      .sort(([aName, aValue], [bName, bValue]) => aName.localeCompare(bName) || aValue.localeCompare(bValue));
    const query = new URLSearchParams(keptParams).toString();
    return `${host}${path}${query ? `?${query}` : ''}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

// SHA-256 of the trimmed posting text, for near-duplicate detection when the
// same posting is captured from two different URLs (e.g. a redirect link).
export async function hashContent(text) {
  const bytes = new TextEncoder().encode((text || '').trim());
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

const MIN_COMPLETE_JD_LENGTH = 200;
const MIN_PARTIAL_JD_LENGTH = 50;

// 'complete': title, company, and enough description text to tailor from.
// 'partial': has some usable fields but is missing or thin on others.
// 'needs_review': no URL, or barely any usable content at all.
export function computeCaptureQuality({ title, company, url, jd_text } = {}) {
  const hasTitle = Boolean(title?.trim());
  const hasCompany = Boolean(company?.trim());
  const hasUrl = Boolean(url?.trim());
  const jdLength = jd_text?.trim().length || 0;

  if (!hasUrl) return 'needs_review';
  if (hasTitle && hasCompany && jdLength >= MIN_COMPLETE_JD_LENGTH) return 'complete';
  if ((hasTitle || hasCompany) && jdLength >= MIN_PARTIAL_JD_LENGTH) return 'partial';
  return 'needs_review';
}

const MIN_RESUME_LENGTH = 200;
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[a-z]{2,}/i;
const PHONE_RE = /(\+?\d[\d\s().-]{7,}\d)/;
const YEAR_RE = /\b(19|20)\d{2}\b/g;
const SKILLS_RE = /\bskills?\b/i;

// Deterministic, keyword-level checks only — no LLM call. Phrased as fixes
// (RAW-5's UX note: don't make this feel like a grade).
export function checkResumeHealth(text) {
  const trimmed = (text || '').trim();
  const issues = [];

  if (trimmed.length < MIN_RESUME_LENGTH) {
    issues.push('This resume looks very short — add more detail so tailoring has something to work with.');
  }
  if (!EMAIL_RE.test(trimmed)) {
    issues.push('No email address found — add contact info so it carries through to tailored output.');
  }
  if (!PHONE_RE.test(trimmed)) {
    issues.push('No phone number found — add contact info so it carries through to tailored output.');
  }
  if ((trimmed.match(YEAR_RE) || []).length < 2) {
    issues.push('No work history dates found — add role dates so experience reads clearly.');
  }
  if (!SKILLS_RE.test(trimmed)) {
    issues.push('No skills section found — add one so skill matching has something to compare against.');
  }

  return issues;
}
