import { normalizeAdzunaJob, normalizeUsaJobsJob } from "../../../src/find-jobs-utils.js";

type SourceQuery = { country: string; query: string; location?: string; salaryMin?: number };
type ConnectorResult = { jobs: Record<string, unknown>[]; summary: Record<string, unknown> };

const ADZUNA_APP_ID = Deno.env.get("ADZUNA_APP_ID");
const ADZUNA_APP_KEY = Deno.env.get("ADZUNA_APP_KEY");
const USAJOBS_API_KEY = Deno.env.get("USAJOBS_API_KEY");
const USAJOBS_USER_AGENT = Deno.env.get("USAJOBS_USER_AGENT");

function skipped(source: string, reason: string): ConnectorResult {
  return { jobs: [], summary: { source, status: "skipped", reason, discovered_count: 0 } };
}

// Connector shape deliberately mirrors a future MCP tool: input is a bounded
// search request and output is normalized jobs plus a source summary.
export async function adzunaConnector(query: SourceQuery, limit: number): Promise<ConnectorResult> {
  if (!ADZUNA_APP_ID || !ADZUNA_APP_KEY) return skipped("Adzuna", "Missing ADZUNA_APP_ID or ADZUNA_APP_KEY.");
  const country = query.country === "in" ? "in" : "us";
  const params = new URLSearchParams({ app_id: ADZUNA_APP_ID, app_key: ADZUNA_APP_KEY, results_per_page: String(Math.min(limit, 10)), what: query.query });
  if (query.location) params.set("where", query.location);
  if (query.salaryMin) params.set("salary_min", String(query.salaryMin));
  const response = await fetch(`https://api.adzuna.com/v1/api/jobs/${country}/search/1?${params}`);
  if (!response.ok) throw new Error(`Adzuna returned ${response.status}`);
  const body = await response.json();
  const jobs = (body.results || []).map((item: Record<string, unknown>) => normalizeAdzunaJob(item, { query: query.query })).filter((job: Record<string, unknown>) => job.source_url);
  return { jobs, summary: { source: "Adzuna", status: "completed", country, query: query.query, discovered_count: jobs.length } };
}

export async function usajobsConnector(query: SourceQuery, limit: number): Promise<ConnectorResult> {
  if (!USAJOBS_API_KEY || !USAJOBS_USER_AGENT) return skipped("USAJOBS", "Missing USAJOBS_API_KEY or USAJOBS_USER_AGENT.");
  if (query.country !== "us") return skipped("USAJOBS", "USAJOBS only covers United States roles.");
  const params = new URLSearchParams({ Keyword: query.query, ResultsPerPage: String(Math.min(limit, 10)) });
  if (query.location && query.location !== "Remote") params.set("LocationName", query.location);
  if (query.salaryMin) params.set("MinSalary", String(query.salaryMin));
  const response = await fetch(`https://data.usajobs.gov/api/Search?${params}`, { headers: { "Authorization-Key": USAJOBS_API_KEY, "User-Agent": USAJOBS_USER_AGENT, "Host": "data.usajobs.gov" } });
  if (!response.ok) throw new Error(`USAJOBS returned ${response.status}`);
  const body = await response.json();
  const items = body.SearchResult?.SearchResultItems || [];
  const jobs = items.map((item: Record<string, unknown>) => normalizeUsaJobsJob(item, { query: query.query })).filter((job: Record<string, unknown>) => job.source_url);
  return { jobs, summary: { source: "USAJOBS", status: "completed", country: "us", query: query.query, discovered_count: jobs.length } };
}
