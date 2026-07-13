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

test('a well-structured answer gets a confirmation instead of blank feedback', () => {
  const answer =
    'In my previous role, I faced a difficult situation where our onboarding flow had a persistently high ' +
    'drop-off rate among new signups. I took decisive action by redesigning the signup form, running two ' +
    'separate rounds of user testing, interviewing dropped-off users directly, and coordinating closely ' +
    'with engineering and design to ship the change within a single sprint despite competing priorities. ' +
    'As a result, conversion increased by twenty four percent within a month, support tickets related to ' +
    'signup confusion dropped significantly, and the team adopted the same testing process for later launches.';
  const review = reviewPracticeAnswer(answer, 'Tell me about a launch.');
  assert.equal(review.feedback.length, 1);
  assert.match(review.feedback[0], /good to go/);
});
