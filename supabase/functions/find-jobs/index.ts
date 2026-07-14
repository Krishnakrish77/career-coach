import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { buildDiscoveryRecommendation } from "../../../src/discovery-utils.js";
import { buildDiscoveryQueryPlan } from "../../../src/find-jobs-utils.js";
import { hashContent, normalizeUrl } from "../../../src/job-utils.js";
import { adzunaConnector, usajobsConnector } from "./connectors.ts";

const MAX_LIMIT = 20;
const RUN_COOLDOWN_SECONDS = 60;
const MAX_RUNS_PER_HOUR = 10;
const corsHeaders = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, x-client-info, apikey, content-type" };

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    let body: { limit?: number } = {};
    try { body = await req.json(); } catch { return Response.json({ error: "Expected a JSON body." }, { status: 400, headers: corsHeaders }); }
    const limit = Math.max(1, Math.min(MAX_LIMIT, Number(body.limit) || 12));
    const { data: preferences, error: preferencesError } = await ctx.supabase.from("profiles").select("target_titles,title_aliases,target_locations,remote_preference,salary_min,industries,excluded_companies").maybeSingle();
    if (preferencesError) return Response.json({ error: preferencesError.message }, { status: 500, headers: corsHeaders });
    const { queries, unsupportedLocations } = buildDiscoveryQueryPlan(preferences || {});
    if (!queries.length) {
      const error = unsupportedLocations.length
        ? "Find Jobs currently supports United States and India locations. Update your target locations to continue."
        : "Add at least one target title or title alias in Settings before finding jobs.";
      return Response.json({ error }, { status: 400, headers: corsHeaders });
    }

    // Discovery is intentionally user-clicked, but a rapid re-click can still
    // spend provider quota. discovery_runs is user-scoped by RLS, so these
    // checks cannot inspect or throttle another user's activity.
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const [latestRunResponse, hourlyRunResponse] = await Promise.all([
      ctx.supabase.from("discovery_runs").select("started_at").order("started_at", { ascending: false }).limit(1).maybeSingle(),
      ctx.supabase.from("discovery_runs").select("id", { count: "exact", head: true }).gte("started_at", oneHourAgo),
    ]);
    if (latestRunResponse.error || hourlyRunResponse.error) return Response.json({ error: latestRunResponse.error?.message || hourlyRunResponse.error?.message }, { status: 500, headers: corsHeaders });
    const secondsSinceLatest = latestRunResponse.data?.started_at ? (Date.now() - new Date(latestRunResponse.data.started_at).getTime()) / 1000 : Infinity;
    if (secondsSinceLatest < RUN_COOLDOWN_SECONDS) {
      return Response.json({ error: `Please wait ${Math.ceil(RUN_COOLDOWN_SECONDS - secondsSinceLatest)}s before finding jobs again.` }, { status: 429, headers: corsHeaders });
    }
    if ((hourlyRunResponse.count || 0) >= MAX_RUNS_PER_HOUR) {
      return Response.json({ error: "Hourly Find Jobs limit reached. Try again later." }, { status: 429, headers: corsHeaders });
    }

    const { data: run, error: runError } = await ctx.supabase.from("discovery_runs").insert({ requested_limit: limit }).select().single();
    if (runError || !run) return Response.json({ error: runError?.message || "Could not start discovery run." }, { status: 500, headers: corsHeaders });
    const { data: resume } = await ctx.supabase.from("resumes").select("raw_text").order("created_at", { ascending: false }).limit(1).maybeSingle();
    const { count: likedCount } = await ctx.supabase.from("job_recommendations").select("id", { count: "exact", head: true }).eq("status", "liked");

    const sourceSummaries: Record<string, unknown>[] = [];
    try {
      const discoveredJobs: Record<string, unknown>[] = [];
      let remainingResults = limit;
      // A single remaining-result budget controls every source call. Calls are
      // sequential so no connector can fetch or persist beyond this run's cap.
      sourceLoop: for (const query of queries) {
        const connectors = [{ source: "Adzuna", search: () => adzunaConnector(query, remainingResults) }];
        if (query.country === "us") connectors.push({ source: "USAJOBS", search: () => usajobsConnector(query, remainingResults) });
        for (const connector of connectors) {
          if (remainingResults <= 0) break sourceLoop;
          try {
            const result = await connector.search();
            const accepted = result.jobs.slice(0, remainingResults);
            discoveredJobs.push(...accepted);
            remainingResults -= accepted.length;
            sourceSummaries.push({ ...result.summary, discovered_count: accepted.length });
          } catch (error) {
            sourceSummaries.push({ source: connector.source, status: "failed", query: query.query, error: error instanceof Error ? error.message : "Source request failed." });
          }
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
        const hash = await hashContent(jdText);
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
        if (discoveredError || !discovered) throw new Error(discoveredError?.message || "Could not save discovered job.");
        discoveredCount += existing ? 0 : 1;
        const recommendation = buildDiscoveryRecommendation({ job: { ...job, first_seen_at: discovered.first_seen_at }, preferences: preferences || {}, likedCount: likedCount || 0, resumeText: resume?.raw_text || "" });
        const { error: recommendationError } = await ctx.supabase.from("job_recommendations").upsert({ discovered_job_id: discovered.id, ...recommendation }, { onConflict: "user_id,discovered_job_id" });
        if (recommendationError) throw new Error(recommendationError.message);
        recommendationCount += 1;
      }
      const failures = sourceSummaries.filter((summary) => summary.status === "failed");
      const completed = sourceSummaries.filter((summary) => summary.status === "completed");
      const status = failures.length ? (completed.length ? "partial_failure" : "failed") : "completed";
      await ctx.supabase.from("discovery_runs").update({ status, finished_at: new Date().toISOString(), source_summaries: sourceSummaries }).eq("id", run.id);
      const market_notice = unsupportedLocations.length ? `Only United States and India sources were searched; unsupported locations: ${unsupportedLocations.join(", ")}` : null;
      return Response.json({ run_id: run.id, discovered_count: discoveredCount, recommendation_count: recommendationCount, source_summaries: sourceSummaries, market_notice }, { headers: corsHeaders });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Discovery run failed.";
      await ctx.supabase.from("discovery_runs").update({ status: "failed", finished_at: new Date().toISOString(), source_summaries: sourceSummaries, error_message: errorMessage }).eq("id", run.id);
      return Response.json({ error: errorMessage, run_id: run.id }, { status: 502, headers: corsHeaders });
    }
  }),
};
