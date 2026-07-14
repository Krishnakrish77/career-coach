import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzePdfAtsReadiness, decodePdfBase64 } from '../supabase/functions/extract-resume/pdf-check.js';

function pdfBase64(source) {
  return Buffer.from(source, 'latin1').toString('base64');
}

test('ATS readiness accepts PDFs with a detectable text layer', () => {
  const result = analyzePdfAtsReadiness(pdfBase64(`%PDF-1.7
1 0 obj
<< /Type /Page /Resources << /Font << /F1 2 0 R >> >> >>
stream
BT /F1 12 Tf (Resume text) Tj ET
endstream
endobj
%%EOF`));

  assert.equal(result.status, 'ok');
  assert.equal(result.has_text_layer, true);
});

test('ATS readiness warns instead of blocking an image-only PDF because a byte scan cannot prove it lacks text', () => {
  const result = analyzePdfAtsReadiness(pdfBase64(`%PDF-1.7
1 0 obj
<< /Type /Page /Resources << /XObject << /Im1 2 0 R >> >> >>
endobj
2 0 obj
<< /Type /XObject /Subtype /Image /Width 1200 /Height 1600 >>
stream
image bytes
endstream
endobj
%%EOF`));

  assert.equal(result.status, 'warn');
  assert.equal(result.has_text_layer, false);
  assert.match(result.warnings.join(' '), /could not be confirmed/);
});

test('ATS readiness warns rather than blocking PDFs whose selectable text is not visible in raw bytes', () => {
  const result = analyzePdfAtsReadiness(pdfBase64('%PDF-1.7\n1 0 obj\n<< /Type /Page >>\nendobj\n%%EOF'));

  assert.equal(result.status, 'warn');
  assert.equal(result.has_text_layer, false);
});

test('ATS readiness reports malformed Base64 as a blocked invalid upload', () => {
  const result = analyzePdfAtsReadiness('not valid base64!');

  assert.equal(result.status, 'blocked');
  assert.equal(result.code, 'invalid_pdf_encoding');
  assert.match(result.issues.join(' '), /Base64/);
});

test('decodePdfBase64 accepts a data URL payload and rejects malformed input', () => {
  assert.deepEqual([...decodePdfBase64('data:application/pdf;base64,JVBERg==')], [37, 80, 68, 70]);
  assert.equal(decodePdfBase64('not valid base64!'), null);
});

test('ATS readiness warns on image-heavy PDFs that still have text', () => {
  const result = analyzePdfAtsReadiness(pdfBase64(`%PDF-1.7
1 0 obj
<< /Type /Page /Resources << /Font << /F1 2 0 R >> /XObject << /Im1 3 0 R >> >> >>
stream
BT /F1 12 Tf (Resume text) Tj ET
endstream
endobj
3 0 obj
<< /Type /XObject /Subtype /Image /Width 200 /Height 200 >>
stream
image bytes
endstream
endobj
%%EOF`));

  assert.equal(result.status, 'warn');
  assert.equal(result.has_text_layer, true);
  assert.equal(result.image_heavy, true);
});
