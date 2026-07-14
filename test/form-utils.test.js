import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectApplicationFields } from '../src/form-utils.js';
test('form detection only suggests known safe field categories', () => {
  const fields = detectApplicationFields([{ name: 'email', tag: 'input' }, { name: 'submit', tag: 'input' }, { label: 'Cover letter', tag: 'textarea' }]);
  assert.deepEqual(fields.map((field) => field.type), ['email', 'cover_letter']);
});

test('first and last name are detected as distinct fillable fields', () => {
  const [firstName, lastName] = detectApplicationFields([
    { name: 'first_name', label: 'First Name', tag: 'input' },
    { name: 'last_name', label: 'Last Name', tag: 'input' },
  ]);
  assert.equal(firstName.type, 'first_name');
  assert.equal(lastName.type, 'last_name');
  assert.notEqual(firstName.groupKey, lastName.groupKey);
});

test('username fields are not mistaken for a person name', () => {
  assert.deepEqual(detectApplicationFields([{ name: 'username', tag: 'input' }]), []);
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
