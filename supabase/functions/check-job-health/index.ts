import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { classifyPostingResponse, detectAtsPosting, isPrivateIpAddress, parsePublicPostingUrl } from "../../../src/job-health-utils.js";

const CHECK_TIMEOUT_MS = 8_000;
const JOB_COOLDOWN_SECONDS = 5 * 60;
const MAX_CHECKS_PER_HOUR = 20;
const corsHeaders = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, x-client-info, apikey, content-type" };

// A hostname can look public and still resolve to an internal address, so the
// blocklist has to run against the resolved IPs, not just the hostname text.
async function assertResolvesToPublicAddress(hostname: string) {
  const [a, aaaa] = await Promise.all([
    Deno.resolveDns(hostname, "A").catch(() => []),
    Deno.resolveDns(hostname, "AAAA").catch(() => []),
  ]);
  const addresses = [...a, ...aaaa];
  if (!addresses.length) throw new Error("The posting host could not be resolved.");
  if (addresses.some(isPrivateIpAddress)) throw new Error("This URL resolves to a private network address.");
}

async function fetchWithTimeout(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  try {
    let nextUrl = url;
    // Do not let fetch automatically follow a redirect to an internal target.
    // Every hop receives the same public-host validation as the original URL,
    // including a fresh DNS-resolved-address check.
    for (let redirects = 0; redirects <= 3; redirects += 1) {
      await assertResolvesToPublicAddress(new URL(nextUrl).hostname);
      const response = await fetch(nextUrl, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: { accept: "text/html,application/json;q=0.9,*/*;q=0.1", "user-agent": "Career Coach posting health check" },
      });
      if (![301, 302, 303, 307, 308].includes(response.status)) return response;
      const location = response.headers.get("location");
      if (!location) return response;
      const parsed = parsePublicPostingUrl(new URL(location, nextUrl).toString());
      if (!parsed.ok) throw new Error(parsed.reason);
      nextUrl = parsed.url.toString();
    }
    throw new Error("The posting redirected too many times; confirm it manually.");
  } finally {
    clearTimeout(timeout);
  }
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return Response.json({ error: "Use POST to check a saved job." }, { status: 405, headers: corsHeaders });
    let body: { job_id?: string };
    try { body = await req.json(); } catch { return Response.json({ error: "Expected a JSON body." }, { status: 400, headers: corsHeaders }); }
    if (!body.job_id) return Response.json({ error: "job_id is required." }, { status: 400, headers: corsHeaders });

    // Shared catalog rows are readable by design but not mutable by a user;
    // availability is only checked for a role that is actually in this user's
    // tracker, so the resulting status cannot be written onto a shared row.
    const { data: job, error: jobError } = await ctx.supabase.from("jobs").select("id,url").eq("id", body.job_id).not("user_id", "is", null).maybeSingle();
    if (jobError) return Response.json({ error: jobError.message }, { status: 500, headers: corsHeaders });
    if (!job) return Response.json({ error: "Saved job not found." }, { status: 404, headers: corsHeaders });
    const parsed = parsePublicPostingUrl(job.url);
    if (!parsed.ok) return Response.json({ error: parsed.reason }, { status: 400, headers: corsHeaders });

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const [latest, hourly] = await Promise.all([
      ctx.supabase.from("job_health_checks").select("checked_at").eq("job_id", job.id).order("checked_at", { ascending: false }).limit(1).maybeSingle(),
      ctx.supabase.from("job_health_checks").select("id", { count: "exact", head: true }).gte("checked_at", oneHourAgo),
    ]);
    if (latest.error || hourly.error) return Response.json({ error: latest.error?.message || hourly.error?.message || "Could not check recent activity." }, { status: 500, headers: corsHeaders });
    const secondsSinceLatest = latest.data?.checked_at ? (Date.now() - new Date(latest.data.checked_at).getTime()) / 1000 : Infinity;
    if (secondsSinceLatest < JOB_COOLDOWN_SECONDS) return Response.json({ error: `This job was checked recently. Try again in ${Math.ceil(JOB_COOLDOWN_SECONDS - secondsSinceLatest)}s.` }, { status: 429, headers: corsHeaders });
    if ((hourly.count || 0) >= MAX_CHECKS_PER_HOUR) return Response.json({ error: "Hourly availability-check limit reached. Try again later." }, { status: 429, headers: corsHeaders });

    const ats = detectAtsPosting(job.url);
    const checker = ats?.checker || "public_url";
    let result;
    let httpStatus: number | null = null;
    try {
      const response = await fetchWithTimeout(ats?.url || parsed.url.toString());
      httpStatus = response.status;
      result = classifyPostingResponse(response.status, checker);
    } catch (error) {
      result = { status: "needs_review", checker, reason: error instanceof Error && error.name === "AbortError" ? "The availability check timed out; confirm the posting manually." : "The employer site could not be reached; confirm the posting manually." };
    }

    const checkedAt = new Date().toISOString();
    const { error: historyError } = await ctx.supabase.from("job_health_checks").insert({ job_id: job.id, status: result.status, checker: result.checker, reason: result.reason, http_status: httpStatus, checked_at: checkedAt });
    if (historyError) return Response.json({ error: historyError.message }, { status: 500, headers: corsHeaders });
    const { error: updateError } = await ctx.supabase.from("jobs").update({ posting_status: result.status, posting_checked_at: checkedAt, posting_check_reason: result.reason, posting_check_http_status: httpStatus }).eq("id", job.id);
    if (updateError) return Response.json({ error: updateError.message }, { status: 500, headers: corsHeaders });
    return Response.json({ ...result, checked_at: checkedAt, http_status: httpStatus }, { headers: corsHeaders });
  }),
};
