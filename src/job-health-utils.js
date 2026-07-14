// Pure helpers shared by the Edge Function and unit tests. The function only
// checks public posting URLs a signed-in user already saved; it never follows
// private-network targets or treats an ambiguous response as an expired role.

const PRIVATE_IPV4 = [
  /^0\./,
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^198\.1[89]\./,
  /^22[4-9]\./,
  /^23\d\./,
];

export function parsePublicPostingUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, reason: 'The saved job URL is invalid.' };
  }
  if (!['https:', 'http:'].includes(url.protocol)) return { ok: false, reason: 'Only public HTTP(S) job URLs can be checked.' };
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host === '::1' || PRIVATE_IPV4.some((pattern) => pattern.test(host))) {
    return { ok: false, reason: 'This URL does not point to a public job site.' };
  }
  if (host.startsWith('[') || host.includes(':')) return { ok: false, reason: 'This URL does not point to a supported public job site.' };
  return { ok: true, url };
}

export function detectAtsPosting(urlValue) {
  const parsed = parsePublicPostingUrl(urlValue);
  if (!parsed.ok) return null;
  const { url } = parsed;
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const parts = url.pathname.split('/').filter(Boolean);
  if ((host === 'boards.greenhouse.io' || host === 'job-boards.greenhouse.io') && parts.length >= 3 && parts[parts.length - 2] === 'jobs') {
    const jobId = parts[parts.length - 1];
    const board = parts[parts.length - 3];
    if (/^\d+$/.test(jobId) && /^[a-z0-9_-]+$/i.test(board)) return { checker: 'greenhouse_api', url: `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs/${encodeURIComponent(jobId)}` };
  }
  if (host === 'jobs.lever.co' && parts.length >= 2) {
    const company = parts[0];
    const posting = parts[1];
    if (/^[a-z0-9_-]+$/i.test(company) && /^[a-z0-9-]+$/i.test(posting)) return { checker: 'lever_api', url: `https://api.lever.co/v0/postings/${encodeURIComponent(company)}/${encodeURIComponent(posting)}` };
  }
  return null;
}

export function classifyPostingResponse(status, checker = 'public_url') {
  if (status >= 200 && status < 300) {
    return {
      status: 'active',
      checker,
      reason: checker === 'public_url' ? 'The public posting page responded successfully.' : 'The employer’s application system lists this posting.',
    };
  }
  if (status === 404 || status === 410) return { status: 'likely_expired', checker, reason: 'The posting was not found by the employer site.' };
  if (status === 401 || status === 403 || status === 405 || status === 429) return { status: 'needs_review', checker, reason: 'The employer site blocked an automated availability check.' };
  return { status: 'needs_review', checker, reason: `The employer site returned ${status}; confirm the posting manually.` };
}

export function healthStatusLabel(status) {
  return {
    unverified: 'Not checked',
    active: 'Active',
    likely_expired: 'Likely expired',
    needs_review: 'Needs review',
  }[status] || 'Needs review';
}
