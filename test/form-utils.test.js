import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectApplicationFields } from '../src/form-utils.js';
test('form detection only suggests known safe field categories', () => {
  const fields = detectApplicationFields([{ name: 'email', tag: 'input' }, { name: 'submit', tag: 'input' }, { label: 'Cover letter', tag: 'textarea' }]);
  assert.deepEqual(fields.map((field) => field.type), ['email', 'cover_letter']);
});
