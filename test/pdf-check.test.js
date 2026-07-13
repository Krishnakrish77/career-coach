import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzePdfAtsReadiness } from '../supabase/functions/extract-resume/pdf-check.js';

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

test('ATS readiness blocks scanned or OCR-dependent image-only PDFs', () => {
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

  assert.equal(result.status, 'blocked');
  assert.equal(result.has_text_layer, false);
  assert.match(result.issues.join(' '), /No selectable text layer/);
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
