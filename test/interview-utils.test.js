import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLikelyQuestions, matchStoriesToQuestion, reviewPracticeAnswer } from '../src/interview-utils.js';

test('interview helpers produce focused questions and exclude sensitive stories', () => {
  assert.ok(buildLikelyQuestions({ title: 'Product Manager', jd_text: 'lead stakeholders' }).length >= 3);
  const matches = matchStoriesToQuestion('Tell me about stakeholder leadership', [{ title: 'Stakeholder launch', skills: ['stakeholder leadership'], confidence: 'user_confirmed' }, { title: 'Private', is_sensitive: true, confidence: 'user_confirmed' }]);
  assert.equal(matches.length, 1);
});

test('practice feedback stays structural and evidence focused', () => {
  const review = reviewPracticeAnswer('I led a launch and improved conversion by 20 percent.', 'Tell me about a launch.');
  assert.equal(review.word_count > 0, true);
  assert.match(review.scope, /Preparation/);
});
