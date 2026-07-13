const words = (value = '') => value.toLowerCase().match(/[a-z][a-z0-9+#.-]{2,}/g) || [];

export function buildLikelyQuestions(job = {}) {
  const title = job.title || 'this role';
  const jd = (job.jd_text || '').toLowerCase();
  const questions = [
    { type: 'behavioral', question: `Tell me about a time you delivered a meaningful result relevant to ${title}.`, reason: 'Behavioral evidence is commonly assessed in first-round interviews.' },
    { type: 'role', question: `Which part of your experience best prepares you for ${title}?`, reason: 'Connect your verified experience directly to the role.' },
    { type: 'motivation', question: `Why are you interested in this role and company?`, reason: 'Use a specific, user-reviewed connection rather than generic praise.' },
  ];
  if (/lead|manage|stakeholder|cross-functional/.test(jd)) questions.push({ type: 'leadership', question: 'Tell me about a time you aligned stakeholders through an ambiguous decision.', reason: 'The posting emphasizes collaboration or leadership.' });
  if (/gap|years|experience|required/.test(jd)) questions.push({ type: 'gap_defense', question: 'How does your experience address the role’s most important requirement?', reason: 'Prepare an honest bridge for key requirements.' });
  return questions.slice(0, 5);
}

// Seeds are deliberately incomplete drafts. They extract no claims beyond the
// supplied resume text and must be explicitly saved by the user before use.
export function extractStorySeeds(resumeText = '') {
  return String(resumeText).split(/\n+/).map((line) => line.trim()).filter((line) => line.length >= 45 && /\b(i|led|built|improved|delivered|managed|created)\b/i.test(line)).slice(0, 5).map((line, index) => ({ title: `Resume story draft ${index + 1}`, situation: line, task: '', action: '', result: '', reflection: '', confidence: 'needs_review', source_type: 'resume_seed' }));
}

export function matchStoriesToQuestion(question, stories = []) {
  const query = new Set(words(question));
  return stories.filter((story) => !story.is_sensitive && story.confidence === 'user_confirmed')
    .map((story) => {
      const evidence = [...(story.skills || []), ...(story.themes || []), story.title, story.situation, story.action].join(' ');
      const overlap = [...new Set(words(evidence))].filter((word) => query.has(word));
      return { story, score: overlap.length, reason: overlap.length ? `Shares: ${overlap.slice(0, 3).join(', ')}.` : 'A confirmed story you can adapt.' };
    }).sort((a, b) => b.score - a.score).slice(0, 3);
}

export function reviewPracticeAnswer(answer, question = '') {
  const text = (answer || '').trim();
  const count = words(text).length;
  const feedback = [];
  if (!text) feedback.push('Add a practice answer before requesting feedback.');
  else {
    if (count < 60) feedback.push('Add concrete context, actions, and an outcome; this answer is quite brief.');
    if (count > 260) feedback.push('Tighten this to a concise 1–2 minute answer.');
    if (!/\b(i|my)\b/i.test(text)) feedback.push('Make your own contribution explicit using “I”.');
    if (!/\b(\d+|%|percent|reduced|increased|improved|saved|grew)\b/i.test(text)) feedback.push('Add a verified result or observable outcome if you have one.');
    if (!/\b(situation|challenge|task|action|result|learned)\b/i.test(text)) feedback.push('Use a simple situation → action → result structure.');
    if (!feedback.length) feedback.push('This reads clearly, with a concrete outcome and a structured story — good to go.');
  }
  return { word_count: count, feedback, question_focus: question.slice(0, 180), scope: 'Preparation feedback only; it does not assess personality, accent, appearance, or live interview performance.' };
}
