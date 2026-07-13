import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gradeFromScore, validateAtsScore } from '../supabase/functions/tailor/scoring.js';

test('validateAtsScore accepts integer scores from 0 to 100', () => {
  assert.equal(validateAtsScore(0), 0);
  assert.equal(validateAtsScore(60), 60);
  assert.equal(validateAtsScore(100), 100);
});

test('validateAtsScore rejects out-of-range and non-integer scores', () => {
  assert.throws(() => validateAtsScore(-1), /0 to 100/);
  assert.throws(() => validateAtsScore(101), /0 to 100/);
  assert.throws(() => validateAtsScore(82.5), /0 to 100/);
  assert.throws(() => validateAtsScore('90'), /0 to 100/);
});

test('gradeFromScore maps validated score ranges to grades', () => {
  assert.equal(gradeFromScore(95), 'A');
  assert.equal(gradeFromScore(80), 'B');
  assert.equal(gradeFromScore(70), 'C');
  assert.equal(gradeFromScore(60), 'D');
  assert.equal(gradeFromScore(59), 'F');
});
