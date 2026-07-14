import { checkResumeHealth } from './job-utils.js';

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[a-z]{2,}/i;
const PHONE_RE = /(\+?\d[\d\s().-]{7,}\d)/;
const LINKEDIN_RE = /linkedin\.com\/in\//i;
const YEAR_RE = /\b(19|20)\d{2}\b/g;
const DEGREE_RE = /\b(bachelor'?s?|master'?s?|ph\.?d\.?|doctorate|degree)\b/i;
const CLEARANCE_RE = /\b(security clearance|secret clearance|top secret|clearance required|us citizen(?:ship)?)\b/i;
const AUTH_RE = /\b(work authorization|authorized to work|visa sponsorship|sponsorship|no sponsorship|citizen(?:ship)?|green card|ead)\b/i;
const NO_SPONSORSHIP_RE = /\b(no sponsorship|without sponsorship|do not sponsor|cannot sponsor|unable to sponsor)\b/i;
const REMOTE_RE = /\b(remote|work from home|distributed)\b/i;
const HYBRID_RE = /\bhybrid\b/i;
const ONSITE_RE = /\b(on[ -]?site|in[- ]office|relocat(?:e|ion)|commut(?:e|ing))\b/i;
const REQUIRED_RE = /\b(required|required qualifications?|minimum qualifications?|must have|need to have|requirements?|you have|proficien(?:t|cy)|hands[- ]on|experience with|\d+\+?\s+years?)\b/i;
const PREFERRED_RE = /\b(preferred|nice to have|bonus|plus|desired|would be great|good to have)\b/i;
const REQUIRED_HEADING_RE = /^\s*(required|required qualifications?|minimum qualifications?|requirements?|what you(?:'| wi)ll bring|about you)\s*:?\s*$/i;
const PREFERRED_HEADING_RE = /^\s*(preferred|preferred qualifications?|nice to have|bonus|desired)\s*:?\s*$/i;
const SECTION_BOUNDARY_RE = /^\s*(responsibilities|what you(?:'| wi)ll do|what you(?:'| wi)ll be doing|the role|about the role|about us|about the team|benefits|compensation|equal opportunity|how to apply|application process)\s*:?\s*$/i;

const STOP_WORDS = new Set([
  'about', 'across', 'after', 'also', 'and', 'are', 'based', 'build', 'can', 'company', 'each', 'from', 'have',
  'into', 'job', 'looking', 'more', 'our', 'product', 'role', 'team', 'that', 'the', 'this', 'through', 'user',
  'using', 'with', 'work', 'will', 'you', 'your',
]);

const SKILL_ALIASES = [
  ['javascript', ['javascript', 'js']],
  ['typescript', ['typescript', 'ts']],
  ['react', ['react', 'react.js', 'reactjs']],
  ['vue', ['vue', 'vue.js']],
  ['angular', ['angular']],
  ['node.js', ['node.js', 'nodejs', 'node']],
  ['python', ['python']],
  ['java', ['java']],
  ['go', ['golang']],
  ['c++', ['c++']],
  ['c#', ['c#']],
  ['sql', ['sql', 'postgres', 'postgresql', 'mysql']],
  ['postgresql', ['postgres', 'postgresql']],
  ['mysql', ['mysql']],
  ['mongodb', ['mongodb', 'mongo']],
  ['redis', ['redis']],
  ['aws', ['aws', 'amazon web services']],
  ['azure', ['azure']],
  ['gcp', ['gcp', 'google cloud']],
  ['docker', ['docker']],
  ['kubernetes', ['kubernetes', 'k8s']],
  ['terraform', ['terraform']],
  ['ci/cd', ['ci/cd', 'continuous integration', 'continuous delivery', 'continuous deployment']],
  ['git', ['git', 'github', 'gitlab']],
  ['rest api', ['rest api', 'restful', 'apis', 'api']],
  ['graphql', ['graphql']],
  ['microservices', ['microservices', 'micro-services']],
  ['distributed systems', ['distributed systems']],
  ['system design', ['system design']],
  ['machine learning', ['machine learning', 'ml']],
  ['artificial intelligence', ['artificial intelligence', 'ai']],
  ['llm', ['llm', 'large language model', 'large language models']],
  ['data analysis', ['data analysis', 'data analytics', 'analytics']],
  ['excel', ['excel']],
  ['tableau', ['tableau']],
  ['power bi', ['power bi', 'powerbi']],
  ['salesforce', ['salesforce']],
  ['hubspot', ['hubspot']],
  ['jira', ['jira']],
  ['agile', ['agile']],
  ['scrum', ['scrum']],
  ['product strategy', ['product strategy']],
  ['roadmap', ['roadmap', 'roadmapping']],
  ['stakeholder management', ['stakeholder management', 'stakeholders']],
  ['user research', ['user research', 'customer research']],
  ['go-to-market', ['go-to-market', 'gtm']],
  ['figma', ['figma']],
  ['ux', ['ux', 'user experience']],
  ['seo', ['seo', 'search engine optimization']],
  ['sem', ['sem', 'search engine marketing']],
  ['lifecycle marketing', ['lifecycle marketing']],
  ['content strategy', ['content strategy']],
  ['project management', ['project management', 'program management']],
  ['budgeting', ['budgeting', 'budget management']],
  ['forecasting', ['forecasting']],
  ['communication', ['communication', 'communications']],
  ['leadership', ['leadership', 'leading teams', 'team leadership']],
];

const TERM_LABELS = {
  'artificial intelligence': 'AI',
  'aws': 'AWS',
  'azure': 'Azure',
  'c#': 'C#',
  'c++': 'C++',
  'ci/cd': 'CI/CD',
  'css': 'CSS',
  'gcp': 'GCP',
  'go': 'Go',
  'graphql': 'GraphQL',
  'hubspot': 'HubSpot',
  'javascript': 'JavaScript',
  'jira': 'Jira',
  'llm': 'LLM',
  'mongodb': 'MongoDB',
  'mysql': 'MySQL',
  'node.js': 'Node.js',
  'postgresql': 'PostgreSQL',
  'power bi': 'Power BI',
  'react': 'React',
  'rest api': 'REST API',
  'salesforce': 'Salesforce',
  'seo': 'SEO',
  'sem': 'SEM',
  'sql': 'SQL',
  'typescript': 'TypeScript',
  'ux': 'UX',
};

function clamp(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function aliasRegex(alias) {
  const escaped = escapeRegExp(alias).replace(/\s+/g, '\\s+');
  return new RegExp(`(^|[^a-z0-9+#.])${escaped}([^a-z0-9+#.]|$)`, 'i');
}

function containsAlias(text, aliases) {
  const haystack = String(text || '');
  return aliases.some((alias) => aliasRegex(alias).test(haystack));
}

function sentenceChunks(text) {
  return String(text || '')
    .replace(/\r/g, '\n')
    .split(/\n+|[.!?]\s+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
}

function lines(text) {
  return String(text || '')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function labelTerm(term) {
  return TERM_LABELS[term] || term.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function findTerms(text) {
  return SKILL_ALIASES
    .filter(([, aliases]) => containsAlias(text, aliases))
    .map(([term]) => term);
}

function findResumeEvidence(resumeText, term) {
  const [, aliases] = SKILL_ALIASES.find(([candidate]) => candidate === term) || [term, [term]];
  const evidenceLine = lines(resumeText).find((line) => containsAlias(line, aliases));
  return evidenceLine || '';
}

function extractRequirementText(jobText) {
  const requiredChunks = [];
  const preferredChunks = [];
  let mode = '';

  for (const line of lines(jobText)) {
    if (PREFERRED_HEADING_RE.test(line)) {
      mode = 'preferred';
      continue;
    }
    if (REQUIRED_HEADING_RE.test(line)) {
      mode = 'required';
      continue;
    }
    if (SECTION_BOUNDARY_RE.test(line)) {
      mode = '';
      continue;
    }

    if (mode === 'required') requiredChunks.push(line);
    if (mode === 'preferred') preferredChunks.push(line);
  }

  for (const chunk of sentenceChunks(jobText)) {
    if (PREFERRED_RE.test(chunk)) preferredChunks.push(chunk);
    else if (REQUIRED_RE.test(chunk)) requiredChunks.push(chunk);
  }

  return { requiredText: unique(requiredChunks).join('\n'), preferredText: unique(preferredChunks).join('\n') };
}

function extractTitleTerms(job = {}) {
  const title = String(job.title || '').toLowerCase();
  return unique(
    (title.match(/[a-z][a-z0-9+#.-]{2,}/g) || [])
      .filter((word) => !STOP_WORDS.has(word))
      .slice(0, 4),
  );
}

function maxYearsMentioned(text) {
  const years = [...String(text || '').matchAll(/\b(\d{1,2})\+?\s+years?\b/gi)]
    .map((match) => Number(match[1]))
    .filter(Number.isFinite);
  return years.length ? Math.max(...years) : null;
}

function buildResumeCompleteness(resumeText) {
  const text = String(resumeText || '').trim();
  if (!text) {
    return {
      score: 0,
      status: 'block',
      findings: ['No resume text is saved.'],
    };
  }

  const issues = checkResumeHealth(text);
  const findings = [];
  findings.push(text.length >= 200 ? 'Resume has enough text to parse.' : 'Resume text is very short.');
  findings.push(EMAIL_RE.test(text) ? 'Email is detectable.' : 'Email is missing.');
  findings.push(PHONE_RE.test(text) ? 'Phone is detectable.' : 'Phone is missing.');
  findings.push((text.match(YEAR_RE) || []).length >= 2 ? 'Work dates are detectable.' : 'Work dates are sparse or missing.');
  findings.push(/\bskills?\b/i.test(text) ? 'Skills section is detectable.' : 'Skills section is missing.');
  if (LINKEDIN_RE.test(text)) findings.push('LinkedIn profile is detectable.');

  return {
    score: clamp(100 - issues.length * 14),
    status: issues.length >= 4 ? 'warn' : 'pass',
    findings,
  };
}

function buildGateChecks({ job = {}, resumeText = '', preferences = {} }) {
  const jobText = `${job.title || ''}\n${job.location || ''}\n${job.jd_text || ''}`;
  const resume = String(resumeText || '');
  const auth = String(preferences.work_authorization || '').toLowerCase();
  const gates = [];

  if (!job.jd_text?.trim()) {
    gates.push({
      key: 'job_description',
      label: 'Job description',
      status: 'block',
      explanation: 'No job description was captured, so requirements cannot be parsed.',
    });
  } else if (job.jd_text.trim().length < 300) {
    gates.push({
      key: 'job_description',
      label: 'Job description',
      status: 'warn',
      explanation: 'The captured description is thin, so requirement matching has low confidence.',
    });
  } else {
    gates.push({
      key: 'job_description',
      label: 'Job description',
      status: 'pass',
      explanation: 'The captured description has enough text for requirement matching.',
    });
  }

  if (AUTH_RE.test(jobText)) {
    const needsSponsorship = /\b(need|require).{0,24}(sponsor|visa)|\bh-?1b\b|\bvisa sponsorship\b/i.test(auth) &&
      !/\b(no sponsorship|without sponsorship|do not require sponsorship|authorized to work)\b/i.test(auth);
    if (!auth) {
      gates.push({
        key: 'work_authorization',
        label: 'Work authorization',
        status: 'unknown',
        explanation: 'The posting mentions authorization or sponsorship; confirm your eligibility before applying.',
      });
    } else if (NO_SPONSORSHIP_RE.test(jobText) && needsSponsorship) {
      gates.push({
        key: 'work_authorization',
        label: 'Work authorization',
        status: 'block',
        explanation: 'The posting says sponsorship is unavailable and your saved preference suggests sponsorship may be needed.',
      });
    } else {
      gates.push({
        key: 'work_authorization',
        label: 'Work authorization',
        status: 'pass',
        explanation: 'Authorization is mentioned and you have saved work-authorization context.',
      });
    }
  } else {
    gates.push({
      key: 'work_authorization',
      label: 'Work authorization',
      status: 'pass',
      explanation: 'No explicit authorization requirement was detected.',
    });
  }

  if (CLEARANCE_RE.test(jobText) && !/\b(clearance|secret|citizen)\b/i.test(auth + ' ' + resume)) {
    gates.push({
      key: 'clearance',
      label: 'Clearance',
      status: 'warn',
      explanation: 'The posting appears to require clearance or citizenship; make eligibility explicit if true.',
    });
  }

  if (DEGREE_RE.test(jobText) && !DEGREE_RE.test(resume)) {
    gates.push({
      key: 'education',
      label: 'Education',
      status: 'warn',
      explanation: 'A degree requirement appears in the posting but no degree signal was found in the resume text.',
    });
  }

  const workPreference = preferences.remote_preference;
  const isRemote = REMOTE_RE.test(jobText);
  const isHybrid = HYBRID_RE.test(jobText);
  const isOnsite = ONSITE_RE.test(jobText);
  if (workPreference) {
    let status = 'unknown';
    let explanation = 'The posting does not clearly state its work arrangement; confirm it before applying.';
    if (workPreference === 'flexible') {
      status = isRemote || isHybrid || isOnsite ? 'pass' : 'unknown';
      explanation = status === 'pass'
        ? 'The posting states a work arrangement and your preference is flexible.'
        : explanation;
    } else if (workPreference === 'remote') {
      status = isRemote ? 'pass' : isHybrid || isOnsite ? 'warn' : 'unknown';
      explanation = isRemote
        ? 'The posting includes remote work, matching your saved preference.'
        : isHybrid
          ? 'Your saved preference is remote, while the posting appears hybrid.'
          : isOnsite
            ? 'Your saved preference is remote, while the posting appears onsite or relocation-based.'
            : explanation;
    } else if (workPreference === 'hybrid') {
      status = isHybrid ? 'pass' : isRemote ? 'pass' : isOnsite ? 'warn' : 'unknown';
      explanation = isHybrid
        ? 'The posting includes hybrid work, matching your saved preference.'
        : isRemote
          ? 'The posting is remote, which is compatible with your saved hybrid preference.'
          : isOnsite
            ? 'Your saved preference is hybrid, while the posting appears onsite.'
            : explanation;
    } else if (workPreference === 'onsite') {
      status = isOnsite || isHybrid ? 'pass' : isRemote ? 'warn' : 'unknown';
      explanation = isOnsite || isHybrid
        ? 'The posting includes an in-person work arrangement, matching your saved preference.'
        : isRemote
          ? 'Your saved preference is onsite, while the posting appears remote.'
          : explanation;
    }
    gates.push({ key: 'location', label: 'Location', status, explanation });
  }

  const requiredYears = maxYearsMentioned(jobText);
  if (requiredYears && !new RegExp(`\\b${requiredYears}\\+?\\s+years?\\b`, 'i').test(resume)) {
    gates.push({
      key: 'experience_years',
      label: 'Years of experience',
      status: 'unknown',
      explanation: `The posting mentions ${requiredYears}+ years; make total years explicit if this is true.`,
    });
  }

  return gates;
}

function gateScore(gates) {
  const weights = { pass: 100, unknown: 65, warn: 45, block: 0 };
  if (!gates.length) return 70;
  return clamp(gates.reduce((total, gate) => total + weights[gate.status], 0) / gates.length);
}

export function extractAtsRequirements(job = {}) {
  const jobText = `${job.title || ''}\n${job.location || ''}\n${job.jd_text || ''}`;
  const { requiredText, preferredText } = extractRequirementText(jobText);
  const allTerms = findTerms(jobText);
  const requiredTerms = findTerms(requiredText);
  const preferredTerms = findTerms(preferredText).filter((term) => !requiredTerms.includes(term));
  const titleTerms = extractTitleTerms(job);

  return {
    all_terms: allTerms,
    required_terms: requiredTerms,
    preferred_terms: preferredTerms,
    title_terms: titleTerms,
    has_required_language: Boolean(requiredText),
  };
}

export function buildAtsSimulation({ job = {}, resumeText = '', preferences = {} } = {}) {
  const resumeTerms = findTerms(resumeText);
  const requirements = extractAtsRequirements(job);
  const resumeCompleteness = buildResumeCompleteness(resumeText);
  const gates = buildGateChecks({ job, resumeText, preferences });
  const gateReadiness = gateScore(gates);
  const requiredTerms = requirements.required_terms;
  const preferredTerms = requirements.preferred_terms;
  const fallbackTerms = requiredTerms.length ? [] : requirements.all_terms.slice(0, 8);
  // Scores must use every extracted term. The view limits how many rows it
  // renders, but truncating this list would turn later requirements into
  // permanent false gaps.
  const evidenceTerms = unique([...requiredTerms, ...preferredTerms, ...fallbackTerms]);

  const evidence = evidenceTerms.map((term) => {
    const found = resumeTerms.includes(term);
    const priority = requiredTerms.includes(term) ? 'required' : preferredTerms.includes(term) ? 'preferred' : 'keyword';
    return {
      term,
      label: labelTerm(term),
      priority,
      found,
      evidence: found ? findResumeEvidence(resumeText, term) : '',
      action: found
        ? 'Keep this evidence explicit in the tailored resume.'
        : priority === 'required'
          ? 'Add truthful resume evidence if you have it; otherwise treat this as a real gap.'
          : 'Consider adding truthful evidence if it is relevant.',
    };
  });

  const matchedRequired = evidence.filter((item) => item.priority === 'required' && item.found);
  const missingRequired = evidence.filter((item) => item.priority === 'required' && !item.found);
  const matchedPreferred = evidence.filter((item) => item.priority === 'preferred' && item.found);
  const missingPreferred = evidence.filter((item) => item.priority === 'preferred' && !item.found);
  const matchedKeywords = evidence.filter((item) => item.found);

  let keywordScore = 50;
  if (requiredTerms.length || preferredTerms.length) {
    if (requiredTerms.length && preferredTerms.length) {
      keywordScore = (matchedRequired.length / requiredTerms.length) * 70 + (matchedPreferred.length / preferredTerms.length) * 30;
    } else if (requiredTerms.length) {
      keywordScore = (matchedRequired.length / requiredTerms.length) * 100;
    } else {
      keywordScore = (matchedPreferred.length / preferredTerms.length) * 100;
    }
  } else if (requirements.all_terms.length) {
    keywordScore = (matchedKeywords.length / Math.min(requirements.all_terms.length, 8)) * 100;
  }

  const searchTerms = unique([...requirements.title_terms, ...requiredTerms, ...requirements.all_terms]).slice(0, 10);
  const matchedSearchTerms = searchTerms.filter((term) => resumeTerms.includes(term) || findResumeEvidence(resumeText, term));
  const searchabilityScore = searchTerms.length ? (matchedSearchTerms.length / searchTerms.length) * 100 : 55;
  const overallScore = clamp(
    resumeCompleteness.score * 0.25 +
    gateReadiness * 0.25 +
    keywordScore * 0.35 +
    searchabilityScore * 0.15,
  );
  const hasBlocker = resumeCompleteness.status === 'block' || gates.some((gate) => gate.status === 'block');
  const warningCount = gates.filter((gate) => gate.status === 'warn' || gate.status === 'unknown').length + missingRequired.length;
  const confidence = !job.jd_text?.trim() || !resumeText?.trim() || !requirements.has_required_language
    ? 'low'
    : warningCount >= 3
      ? 'medium'
      : 'high';
  const status = hasBlocker
    ? 'blocked'
    : overallScore >= 80 && missingRequired.length === 0
      ? 'ready'
      : 'needs_review';

  return {
    status,
    overall_score: overallScore,
    confidence,
    resume_completeness: resumeCompleteness,
    gate_readiness_score: gateReadiness,
    keyword_score: clamp(keywordScore),
    searchability_score: clamp(searchabilityScore),
    gates,
    requirements,
    evidence,
    matched_required: matchedRequired.map((item) => item.label),
    missing_required: missingRequired.map((item) => item.label),
    matched_preferred: matchedPreferred.map((item) => item.label),
    missing_preferred: missingPreferred.map((item) => item.label),
    recruiter_search_terms: searchTerms.map((term) => ({ term, label: labelTerm(term), found: matchedSearchTerms.includes(term) })),
  };
}

export function atsStatusLabel(status) {
  return {
    blocked: 'Blocked',
    needs_review: 'Needs review',
    ready: 'Ready',
  }[status] || 'Needs review';
}
