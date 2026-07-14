function normalizeExtractedText(value) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Keep the parser interaction isolated so its output contract can be tested in
// Node without requiring the Deno Edge runtime. `unpdf` supplies these methods
// in production using its serverless PDF.js bundle.
export async function extractEmbeddedPdfText(parser, bytes) {
  const pdf = await parser.getDocumentProxy(bytes);
  try {
    const result = await parser.extractText(pdf, { mergePages: true });
    return {
      rawText: normalizeExtractedText(result.text),
      pageCount: Number(result.totalPages) || 0,
    };
  } finally {
    await pdf.destroy?.();
  }
}
