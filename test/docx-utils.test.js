import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDocx } from '../src/docx-utils.js';

test('createDocx produces a ZIP payload', () => {
  const file = createDocx('A & B');
  assert.deepEqual([...file.slice(0, 4)], [0x50, 0x4b, 3, 4]);
  assert.ok(file.length > 300);
});
