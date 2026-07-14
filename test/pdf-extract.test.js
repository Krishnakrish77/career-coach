import test from 'node:test';
import assert from 'node:assert/strict';
import { extractEmbeddedPdfText } from '../supabase/functions/extract-resume/pdf-extract.js';

test('parser extraction normalizes text and reports the parsed page count', async () => {
  let destroyed = false;
  const parser = {
    async getDocumentProxy(bytes) {
      assert.deepEqual([...bytes], [1, 2, 3]);
      return { async destroy() { destroyed = true; } };
    },
    async extractText(_pdf, options) {
      assert.deepEqual(options, { mergePages: true });
      return { totalPages: 2, text: 'Name\r\n\r\n\r\nExperience\n' };
    },
  };

  const result = await extractEmbeddedPdfText(parser, new Uint8Array([1, 2, 3]));
  assert.deepEqual(result, { rawText: 'Name\n\nExperience', pageCount: 2 });
  assert.equal(destroyed, true);
});

test('parser extraction closes the PDF when text extraction fails', async () => {
  let destroyed = false;
  const parser = {
    async getDocumentProxy() { return { async destroy() { destroyed = true; } }; },
    async extractText() { throw new Error('malformed stream'); },
  };

  await assert.rejects(() => extractEmbeddedPdfText(parser, new Uint8Array()), /malformed stream/);
  assert.equal(destroyed, true);
});
