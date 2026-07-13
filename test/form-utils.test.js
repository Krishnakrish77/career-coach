import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectApplicationFields } from '../src/form-utils.js';
test('form detection only suggests known safe field categories', () => {
  const fields = detectApplicationFields([{ name: 'email', tag: 'input' }, { name: 'submit', tag: 'input' }, { label: 'Cover letter', tag: 'textarea' }]);
  assert.deepEqual(fields.map((field) => field.type), ['email', 'cover_letter']);
});

test('same-type fields with different labels get distinct group keys', () => {
  // Regression test: "First Name" and "Last Name" both match type 'name',
  // but they are different questions and must not share one filled value.
  const [firstName, lastName] = detectApplicationFields([
    { name: 'first_name', label: 'First Name', tag: 'input' },
    { name: 'last_name', label: 'Last Name', tag: 'input' },
  ]);
  assert.equal(firstName.type, 'name');
  assert.equal(lastName.type, 'name');
  assert.notEqual(firstName.groupKey, lastName.groupKey);
});

test('two unlabeled essay questions get distinct group keys', () => {
  const [first, second] = detectApplicationFields([
    { placeholder: 'Why do you want to work here?', tag: 'textarea' },
    { placeholder: 'Describe a challenge you overcame', tag: 'textarea' },
  ]);
  assert.equal(first.type, 'text_answer');
  assert.equal(second.type, 'text_answer');
  assert.notEqual(first.groupKey, second.groupKey);
});

test('truly identical fields (no distinguishing text) share a group key', () => {
  const [a, b] = detectApplicationFields([{ name: 'email', tag: 'input' }, { name: 'email', tag: 'input' }]);
  assert.equal(a.groupKey, b.groupKey);
});
