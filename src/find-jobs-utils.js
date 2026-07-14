// Pure helpers shared by the Edge Function and unit tests. Connectors return
// this small, source-neutral shape so discovery never depends on crawling.
const US_LOCATION_RE = /\b(us|u\.s\.|united states|america|new york|california|texas|washington)\b/i;
const INDIA_LOCATION_RE = /\b(india|bengaluru|bangalore|mumbai|delhi|hyderabad|pune|chennai)\b/i;

function strings(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim()) : [];
}

function queryText(title, remotePreference) {
  return [title, remotePreference === 'remote' ? 'remote' : ''].filter(Boolean).join(' ');
}

// Keep each click predictable: at most three title searches per supported
// country. When explicit locations are provided, do not silently search a
// different country: v1 supports US and India only.
export function buildDiscoveryQueryPlan(preferences = {}) {
  const titles = [...new Set([...strings(preferences.target_titles), ...strings(preferences.title_aliases)])].slice(0, 3);
  const locations = strings(preferences.target_locations);
  const supportedCountries = [
    { country: 'us', locations: locations.filter((value) => US_LOCATION_RE.test(value)) },
    { country: 'in', locations: locations.filter((value) => INDIA_LOCATION_RE.test(value)) },
  ];
  const countries = locations.length
    ? supportedCountries.filter(({ locations: matches }) => matches.length)
    : supportedCountries;
  const unsupportedLocations = locations.filter((location) => !US_LOCATION_RE.test(location) && !INDIA_LOCATION_RE.test(location));
  const queries = countries.flatMap(({ country, locations: matchedLocations }) => titles.map((title) => ({
    country,
    title,
    query: queryText(title, preferences.remote_preference),
    location: matchedLocations[0] || (preferences.remote_preference === 'remote' ? 'Remote' : ''),
    salaryMin: Number.isFinite(Number(preferences.salary_min)) ? Number(preferences.salary_min) : undefined,
  })));
  return { queries, unsupportedLocations };
}

export function buildDiscoveryQueries(preferences = {}) {
  return buildDiscoveryQueryPlan(preferences).queries;
}

function compactPayload(payload) {
  // Keep raw source evidence useful without turning discovery rows into an
  // unbounded mirror of third-party data.
  return payload && typeof payload === 'object' ? payload : {};
}

export function normalizeAdzunaJob(result = {}, { query = '' } = {}) {
  const description = result.description || '';
  return {
    source: 'adzuna',
    source_external_id: result.id ? String(result.id) : null,
    source_url: result.redirect_url || result.url || '',
    title: result.title || '',
    company: result.company?.display_name || '',
    location: result.location?.display_name || '',
    jd_text: description,
    source_query: query,
    source_payload: compactPayload({
      id: result.id, created: result.created, salary_min: result.salary_min,
      salary_max: result.salary_max, description_is_snippet: true,
    }),
    description_is_snippet: true,
  };
}

export function normalizeUsaJobsJob(item = {}, { query = '' } = {}) {
  const descriptor = item.MatchedObjectDescriptor || item;
  const remuneration = descriptor.PositionRemuneration?.[0] || {};
  const location = (descriptor.PositionLocation || []).map((entry) => entry.LocationName).filter(Boolean).join(', ');
  const summary = descriptor.UserArea?.Details?.JobSummary || descriptor.JobSummary || '';
  return {
    source: 'usajobs',
    source_external_id: item.MatchedObjectId ? String(item.MatchedObjectId) : (descriptor.PositionID || null),
    source_url: descriptor.PositionURI || descriptor.ApplyURI?.[0] || '',
    title: descriptor.PositionTitle || '',
    company: descriptor.OrganizationName || '',
    location,
    jd_text: summary,
    source_query: query,
    source_payload: compactPayload({
      id: item.MatchedObjectId, publication_start: descriptor.PublicationStartDate,
      application_close: descriptor.ApplicationCloseDate, salary_min: remuneration.MinimumRange,
      salary_max: remuneration.MaximumRange, salary_interval: remuneration.RateIntervalCode,
    }),
    description_is_snippet: false,
  };
}

export function atsSimulationSummary(resumeText = '', jobText = '') {
  const words = (value) => new Set((value.toLowerCase().match(/[a-z][a-z+#.-]{2,}/g) || []));
  const resumeWords = words(resumeText);
  const jobWords = words(jobText);
  if (!resumeWords.size || !jobWords.size) return null;
  const overlap = [...jobWords].filter((word) => resumeWords.has(word)).length;
  const score = Math.min(100, Math.round((overlap / Math.min(jobWords.size, 40)) * 100));
  return `ATS keyword simulation: ${score}/100 based on ${overlap} shared terms.`;
}
