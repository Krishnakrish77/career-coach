import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { buildDiscoveryRecommendation } from "../../../src/discovery-utils.js";
import { buildDiscoveryQueries } from "../../../src/find-jobs-utils.js";
import { adzunaConnector, usajobsConnector } from "./connectors.ts";

const MAX_LIMIT = 20;
const corsHeaders = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, x-client-info, apikey, content-type" };

const TRACKING_QUERY_PARAMS = new Set(["fbclid", "gclid", "igshid", "mc_cid", "mc_eid", "msclkid", "ref", "ref_src", "referrer", "trk", "yclid"]);
function normalizeUrl(url: string) {
  // Deliberately matches src/job-utils.js, allowing connector results and
  // manual imports to resolve to the same discovered_jobs row.
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    const path = parsed.pathname.replace(/\/+$/, "");
    const params = [...parsed.searchParams.entries()]
      .filter(([name]) => !name.toLowerCase().startsWith("utm_") && !TRACKING_QUERY_PARAMS.has(name.toLowerCase()))
      .sort(([aName, aValue], [bName, bValue]) => aName.localeCompare(bName) || aValue.localeCompare(bValue));
    const query = new URLSearchParams(params).toString();
    return `${host}${path}${query ? `?${query}` : ""}`;
  } catch { return url.trim().toLowerCase(); }
}
async function contentHash(text: string) {
  const bytes = new TextEncoder().encode((text || "").trim());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    let body: { limit?: number } = {};
    try { body = await req.json(); } catch { return Response.json({ error: "Expected a JSON body." }, { status: 400, headers: corsHeaders }); }
    const limit = Math.max(1, Math.min(MAX_LIMIT, Number(body.limit) || 12));
    const { data: preferences, error: preferencesError } = await ctx.supabase.from("profiles").select("target_titles,title_aliases,target_locations,remote_preference,salary_min,industries,excluded_companies").maybeSingle();
    if (preferencesError) return Response.json({ error: preferencesError.message }, { status: 500, headers: corsHeaders });
    const queries = buildDiscoveryQueries(preferences || {});
    if (!queries.length) return Response.json({ error: "Add at least one target title or title alias in Settings before finding jobs." }, { status: 400, headers: corsHeaders });

    const { data: run, error: runError } = await ctx.supabase.from("discovery_runs").insert({ requested_limit: limit }).select().single();
    if (runError || !run) return Response.json({ error: runError?.message || "Could not start discovery run." }, { status: 500, headers: corsHeaders });
    const { data: resume } = await ctx.supabase.from("resumes").select("raw_text").order("created_at", { ascending: false }).limit(1).maybeSingle();
    const { count: likedCount } = await ctx.supabase.from("job_recommendations").select("id", { count: "exact", head: true }).eq("status", "liked");

    const sourceSummaries: Record<string, unknown>[] = [];
    const discoveredJobs: Record<string, unknown>[] = [];
    // The connector calls are bounded by query generation and each connector's
    // page cap; Promise.all lets a partial source outage remain non-fatal.
    for (const query of queries) {
      const connectors = [adzunaConnector(query, Math.ceil(limit / queries.length))];
      if (query.country === "us") connectors.push(usajobsConnector(query, Math.ceil(limit / queries.length)));
      const settled = await Promise.allSettled(connectors);
      for (const result of settled) {
        if (result.status === "fulfilled") { discoveredJobs.push(...result.value.jobs); sourceSummaries.push(result.value.summary); }
        else sourceSummaries.push({ source: "connector", status: "failed", query: query.query, error: result.reason?.message || "Source request failed." });
      }
    }

    let recommendationCount = 0;
    let discoveredCount = 0;
    const seen = new Set<string>();
    for (const job of discoveredJobs) {
      const sourceUrl = String(job.source_url || "");
      const normalizedUrl = normalizeUrl(sourceUrl);
      if (!normalizedUrl || seen.has(normalizedUrl)) continue;
      seen.add(normalizedUrl);
      const jdText = String(job.jd_text || "");
      const hash = await contentHash(jdText);
      let existing = null;
      if (jdText.trim().length >= 80) {
        const { data } = await ctx.supabase.from("discovered_jobs").select("*").eq("content_hash", hash).limit(1).maybeSingle();
        existing = data;
      }
      if (!existing) {
        const { data } = await ctx.supabase.from("discovered_jobs").select("*").eq("normalized_url", normalizedUrl).limit(1).maybeSingle();
        existing = data;
      }
      // description_is_snippet is scoring-only metadata; its durable copy is
      // intentionally nested in source_payload rather than becoming a column.
      const { description_is_snippet: _snippet, ...persistedJob } = job;
      const values = { ...persistedJob, normalized_url: normalizedUrl, content_hash: hash, last_seen_at: new Date().toISOString() };
      const { data: discovered, error: discoveredError } = existing
        ? await ctx.supabase.from("discovered_jobs").update(values).eq("id", existing.id).select().single()
        : await ctx.supabase.from("discovered_jobs").insert(values).select().single();
      if (discoveredError || !discovered) continue;
      discoveredCount += existing ? 0 : 1;
      const recommendation = buildDiscoveryRecommendation({ job: { ...job, first_seen_at: discovered.first_seen_at }, preferences: preferences || {}, likedCount: likedCount || 0, resumeText: resume?.raw_text || "" });
      const { error: recommendationError } = await ctx.supabase.from("job_recommendations").upsert({ discovered_job_id: discovered.id, ...recommendation }, { onConflict: "user_id,discovered_job_id" });
      if (!recommendationError) recommendationCount += 1;
    }
    const failures = sourceSummaries.some((summary) => summary.status === "failed");
    await ctx.supabase.from("discovery_runs").update({ status: failures ? "partial_failure" : "completed", finished_at: new Date().toISOString(), source_summaries: sourceSummaries }).eq("id", run.id);
    return Response.json({ run_id: run.id, discovered_count: discoveredCount, recommendation_count: recommendationCount, source_summaries: sourceSummaries }, { headers: corsHeaders });
  }),
};
