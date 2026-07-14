const NOISE_LINE = /^(?:skip to (?:search|main content|sidebar|primary content|aside)|\d+ notifications?|home|my network|jobs|messaging|notifications|for business|try premium for \$?0)$/i;
const SITE_SUFFIX = /\s*[|·]\s*(?:linkedin|indeed|glassdoor|ziprecruiter|monster)\s*$/i;
const MIN_FOCUSED_DESCRIPTION_LENGTH = 120;
const MAX_CAPTURE_LENGTH = 12000;

function normalizeLine(value) {
  return String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

export function cleanCapturedText(value = '') {
  const seen = new Set();
  return String(value)
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter((line) => line && !NOISE_LINE.test(line))
    .filter((line) => {
      const key = line.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join('\n')
    .slice(0, MAX_CAPTURE_LENGTH);
}

export function cleanCapturedTitle(value = '') {
  return normalizeLine(value).replace(SITE_SUFFIX, '').trim();
}

function candidateScore(candidate = {}, index) {
  const text = cleanCapturedText(candidate.text);
  if (text.length < MIN_FOCUSED_DESCRIPTION_LENGTH) return { text: '', score: -1 };
  // Selector priority dominates length, so a dedicated description region
  // wins over a broad main/article fallback even when the latter is longer.
  return { text, score: (Number(candidate.priority) || 0) * 100000 + Math.min(text.length, 10000) - index };
}

export function buildJobCapture({ pageTitle = '', metadata = {}, descriptionCandidates = [], fallbackText = '' } = {}) {
  const selected = descriptionCandidates
    .map((candidate, index) => ({ candidate, ...candidateScore(candidate, index) }))
    .sort((a, b) => b.score - a.score)[0];
  const focused = selected?.text || '';
  const fallback = cleanCapturedText(fallbackText);
  const description = focused || fallback;
  const source = focused ? 'focused' : 'fallback';

  return {
    title: cleanCapturedTitle(metadata.title || pageTitle),
    company: normalizeLine(metadata.company),
    location: normalizeLine(metadata.location),
    jd_text: description,
    source,
    confidence: focused
      ? (Number(selected.candidate.priority) >= 80 ? 'high' : 'medium')
      : 'needs_review',
  };
}
