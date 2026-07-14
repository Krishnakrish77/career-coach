function decodeBase64(base64) {
  const clean = String(base64 || '').replace(/^data:application\/pdf;base64,/, '').replace(/\s/g, '');
  if (!clean) return null;
  let binary;
  try {
    binary = atob(clean);
  } catch {
    return null;
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function pdfText(bytes) {
  return new TextDecoder('latin1').decode(bytes.slice(0, Math.min(bytes.length, 2_000_000)));
}

function count(pattern, value) {
  return value.match(pattern)?.length || 0;
}

export function analyzePdfAtsReadiness(pdfBase64) {
  const bytes = decodeBase64(pdfBase64);
  if (!bytes) {
    return {
      status: 'blocked',
      code: 'invalid_pdf_encoding',
      has_text_layer: false,
      image_heavy: false,
      page_count: 0,
      image_object_count: 0,
      font_object_count: 0,
      text_operator_count: 0,
      issues: ['The uploaded file is not valid Base64-encoded PDF data.'],
      warnings: [],
    };
  }
  const text = pdfText(bytes);
  const startsLikePdf = text.startsWith('%PDF-');
  const pageCount = count(/\/Type\s*\/Page\b/g, text);
  const imageObjectCount = count(/\/Subtype\s*\/Image\b/g, text);
  const fontObjectCount = count(/\/Font\b/g, text) + count(/\/ToUnicode\b/g, text);
  const textOperatorCount = count(/\b(?:BT|Tj|TJ)\b/g, text);
  const hasTextLayer = fontObjectCount > 0 || textOperatorCount > 0;
  const imageHeavy = imageObjectCount >= Math.max(1, pageCount || 1);
  const issues = [];
  const warnings = [];

  if (!startsLikePdf) issues.push('The uploaded file is not a valid PDF.');
  if (startsLikePdf && !hasTextLayer) {
    // A byte scan is deliberately not used as a hard gate: valid PDFs often
    // compress page content or place it in object streams, neither of which
    // exposes BT/Tj/TJ tokens in the raw bytes we inspect here.
    warnings.push('A selectable text layer could not be confirmed. This may be a scanned or image-based PDF; verify the extracted text carefully.');
  }
  if (startsLikePdf && hasTextLayer && imageHeavy) {
    warnings.push('This PDF is image-heavy. Verify the extracted text carefully; image-based resumes often perform poorly in ATS systems.');
  }

  return {
    status: issues.length ? 'blocked' : warnings.length ? 'warn' : 'ok',
    code: issues.length ? 'invalid_pdf' : null,
    has_text_layer: hasTextLayer,
    image_heavy: imageHeavy,
    page_count: pageCount,
    image_object_count: imageObjectCount,
    font_object_count: fontObjectCount,
    text_operator_count: textOperatorCount,
    issues,
    warnings,
  };
}
