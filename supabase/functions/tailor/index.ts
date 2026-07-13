// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

// The operator's own keys — never sent to the client, only used server-side.
// Set via `supabase secrets set ANTHROPIC_API_KEY=...` / `OPENAI_API_KEY=...` / `GEMINI_API_KEY=...`.
// Client sends a provider/model *preference*; the operator's key pays for it.
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

const TAILOR_SCHEMA = {
  type: "object",
  properties: {
    tailored_resume: { type: "string" },
    cover_letter: { type: "string" },
  },
  required: ["tailored_resume", "cover_letter"],
  additionalProperties: false,
};

async function callAnthropic(model: string, systemPrompt: string, userPrompt: string) {
  if (!ANTHROPIC_API_KEY) throw new Error("Anthropic isn't configured on this server (missing ANTHROPIC_API_KEY secret).");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      output_config: { format: { type: "json_schema", schema: TAILOR_SCHEMA } },
    }),
  });
  if (!res.ok) throw new Error(`Anthropic error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const textBlock = data.content.find((b: { type: string }) => b.type === "text");
  return JSON.parse(textBlock.text);
}

async function callOpenAI(model: string, systemPrompt: string, userPrompt: string) {
  if (!OPENAI_API_KEY) throw new Error("OpenAI isn't configured on this server (missing OPENAI_API_KEY secret).");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_schema", json_schema: { name: "tailored_output", schema: TAILOR_SCHEMA, strict: true } },
    }),
  });
  if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
}

// Gemini's structured-output schema is a restricted OpenAPI subset — no
// `additionalProperties` key, unlike the Anthropic/OpenAI schema above.
const GEMINI_SCHEMA = {
  type: "object",
  properties: TAILOR_SCHEMA.properties,
  required: TAILOR_SCHEMA.required,
};

async function callGemini(model: string, systemPrompt: string, userPrompt: string) {
  if (!GEMINI_API_KEY) throw new Error("Gemini isn't configured on this server (missing GEMINI_API_KEY secret).");
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema: GEMINI_SCHEMA },
      }),
    },
  );
  if (!res.ok) throw new Error(`Gemini error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return JSON.parse(data.candidates[0].content.parts[0].text);
}

// Model IDs below aren't backed by a live-verified catalog the way the Anthropic
// ones are — double check against Google's current model list before relying on it.
const DEFAULT_MODEL: Record<string, string> = {
  anthropic: "claude-opus-4-8",
  openai: "gpt-4o",
  gemini: "gemini-2.5-pro",
};

// auth: "user" requires a valid caller JWT. ctx.supabase is then scoped to
// that user, so every query below is subject to RLS automatically — no
// manual user_id filtering needed, and no risk of leaking another user's row.
export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    const { job_id, provider = "anthropic", model } = await req.json();
    if (!job_id) {
      return Response.json({ error: "job_id is required" }, { status: 400 });
    }
    if (!["anthropic", "openai", "gemini"].includes(provider)) {
      return Response.json({ error: `Unknown provider: ${provider}` }, { status: 400 });
    }

    const { data: job, error: jobError } = await ctx.supabase
      .from("jobs")
      .select("*")
      .eq("id", job_id)
      .single();
    if (jobError || !job) {
      return Response.json({ error: "Job not found or not accessible" }, { status: 404 });
    }

    const { data: resume, error: resumeError } = await ctx.supabase
      .from("resumes")
      .select("raw_text")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (resumeError) {
      return Response.json({ error: resumeError.message }, { status: 500 });
    }
    if (!resume) {
      return Response.json(
        { error: "No resume on file. Save one in the Resume tab first." },
        { status: 400 },
      );
    }

    const systemPrompt =
      "You are a career coach. Given a resume and a job posting, produce a tailored resume " +
      "(rewritten bullets emphasizing relevant experience) and a concise cover letter.";
    const userPrompt =
      `RESUME:\n${resume.raw_text}\n\n` +
      `JOB POSTING (raw page text, may include nav/boilerplate — ignore that):\n${job.jd_text ?? ""}`;
    const resolvedModel = model || DEFAULT_MODEL[provider];

    const CALL_BY_PROVIDER: Record<string, typeof callAnthropic> = {
      anthropic: callAnthropic,
      openai: callOpenAI,
      gemini: callGemini,
    };

    let parsed;
    try {
      parsed = await CALL_BY_PROVIDER[provider](resolvedModel, systemPrompt, userPrompt);
    } catch (err) {
      return Response.json({ error: (err as Error).message }, { status: 502 });
    }

    const { data: application, error: upsertError } = await ctx.supabase
      .from("applications")
      .upsert(
        {
          job_id,
          tailored_resume: parsed.tailored_resume,
          cover_letter: parsed.cover_letter,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,job_id" },
      )
      .select()
      .single();

    if (upsertError) {
      return Response.json({ error: upsertError.message }, { status: 500 });
    }

    return Response.json(application);
  }),
};

/* To invoke locally:

  1. Run `supabase start`
  2. Make an HTTP request with a real user's access token:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/tailor' \
    --header 'Authorization: Bearer <user-access-token>' \
    --header 'Content-Type: application/json' \
    --data '{"job_id":"<uuid>"}'

*/
