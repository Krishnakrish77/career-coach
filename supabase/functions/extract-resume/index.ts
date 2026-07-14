// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { extractText, getDocumentProxy } from "unpdf";
import { decodePdfBase64, analyzePdfAtsReadiness } from "./pdf-check.js";
import { extractEmbeddedPdfText } from "./pdf-extract.js";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
// Disabled by default. This is only for parser failures on a PDF that appears
// to expose a text layer; it must never turn scanned/image-only documents into
// silent AI/OCR extraction.
const ENABLE_AI_PDF_FALLBACK = Deno.env.get("ENABLE_AI_PDF_FALLBACK") === "true";

// ~11MB decoded (base64 is ~4/3 the size of the raw bytes) — comfortably under
// Anthropic's 32MB request limit, just a guard against absurd payloads.
const MAX_PDF_BASE64_CHARS = 15_000_000;

// auth: "user" requires a valid caller JWT — this endpoint doesn't touch the
// database at all, but it still shouldn't be callable by an unauthenticated
// request (it spends the operator's Anthropic budget).
export default {
  fetch: withSupabase({ auth: "user" }, async (req) => {
    const { pdf_base64 } = await req.json();
    if (!pdf_base64 || typeof pdf_base64 !== "string") {
      return Response.json({ error: "pdf_base64 is required" }, { status: 400 });
    }
    if (pdf_base64.length > MAX_PDF_BASE64_CHARS) {
      return Response.json({ error: "PDF is too large." }, { status: 400 });
    }

    const atsReadiness = analyzePdfAtsReadiness(pdf_base64);
    if (atsReadiness.status === "blocked") {
      return Response.json(
        {
          code: atsReadiness.code || "invalid_pdf",
          error: "The uploaded file is not a valid PDF. Choose a PDF file or paste the verified resume text instead.",
          ats_readiness: atsReadiness,
        },
        { status: 400 },
      );
    }

    const bytes = decodePdfBase64(pdf_base64);
    // `analyzePdfAtsReadiness` already handles an invalid encoding above; this
    // keeps the type narrowing explicit for the parser.
    if (!bytes) {
      return Response.json({ error: "The uploaded file is not valid PDF data." }, { status: 400 });
    }

    try {
      const extraction = await extractEmbeddedPdfText({ getDocumentProxy, extractText }, bytes);
      if (!extraction.rawText) {
        return Response.json(
          {
            code: "pdf_text_not_found",
            error: "No selectable text could be extracted from this PDF. Export a text-based PDF from your resume editor or paste verified resume text instead.",
            ats_readiness: atsReadiness,
          },
          { status: 422 },
        );
      }
      return Response.json({
        raw_text: extraction.rawText,
        ats_readiness: atsReadiness,
        extraction_method: "parser",
        page_count: extraction.pageCount,
      });
    } catch (parserError) {
      // Fall through only when an operator has explicitly enabled the legacy
      // fallback and the lightweight signal indicates a real text layer.
      if (!ENABLE_AI_PDF_FALLBACK || !ANTHROPIC_API_KEY || !atsReadiness.has_text_layer) {
        console.error("PDF parser failed", parserError);
        return Response.json(
          {
            code: "pdf_parse_failed",
            error: "We could not read selectable text from this PDF. Export a text-based PDF from your resume editor or paste verified resume text instead.",
            ats_readiness: atsReadiness,
          },
          { status: 422 },
        );
      }
    }

    if (!ANTHROPIC_API_KEY) {
      return Response.json(
        { error: "PDF extraction fallback isn't configured on this server (missing ANTHROPIC_API_KEY secret)." },
        { status: 503 },
      );
    }

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: [
              { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdf_base64 } },
              {
                type: "text",
                text:
                  "Extract this resume as plain text. Preserve section structure — headings on their own " +
                  "line, bullet points as lines starting with \"- \". Output only the extracted text, no " +
                  "commentary, no markdown formatting.",
              },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return Response.json({ error: `Anthropic error: ${text}` }, { status: 502 });
    }

    const data = await res.json();
    const textBlock = data.content.find((b: { type: string }) => b.type === "text");
    if (!textBlock?.text) {
      return Response.json({ error: "Could not extract any text from that PDF." }, { status: 422 });
    }

    return Response.json({
      raw_text: textBlock.text,
      ats_readiness: atsReadiness,
      extraction_method: "ai_fallback",
    });
  }),
};

/* To invoke locally:

  1. Run `supabase start`
  2. Make an HTTP request with a real user's access token:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/extract-resume' \
    --header 'Authorization: Bearer <user-access-token>' \
    --header 'Content-Type: application/json' \
    --data "{\"pdf_base64\":\"$(base64 -i resume.pdf)\"}"

*/
