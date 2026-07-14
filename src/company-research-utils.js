import { extractAtsRequirements } from './ats-utils.js';

const MAX_SOURCE_NOTES = 1600;

function clean(value, limit = 240) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function confirmedEvidence(evidence = []) {
  return evidence.find((item) => item?.review_status === 'user_confirmed' && clean(item.evidence_text, 300));
}

// This deliberately works only from the saved role, notes the user provided,
// and user-confirmed evidence. It does not claim to have researched a company
// or discovered a contact on the user's behalf.
export function buildCompanyResearchBrief({ job = {}, sourceNotes = '', careerEvidence = [] } = {}) {
  const notes = clean(sourceNotes, MAX_SOURCE_NOTES);
  const requirements = extractAtsRequirements(job);
  const roleThemes = (requirements.required_terms?.length ? requirements.required_terms : requirements.all_terms || [])
    .slice(0, 4);
  const evidence = confirmedEvidence(careerEvidence);
  const role = clean(job.title, 140) || 'this role';
  const company = clean(job.company, 140) || 'your team';
  const evidenceLine = evidence ? clean(evidence.evidence_text, 260) : '';
  const evidenceTitle = evidence ? clean(evidence.title, 120) : '';
  const themeText = roleThemes.length ? roleThemes.join(', ') : 'the role priorities in the posting';
  const contextLine = notes
    ? `I also reviewed the company context you shared: ${notes.slice(0, 260)}${notes.length > 260 ? '…' : ''}`
    : 'I am reviewing the role requirements and would welcome context on the team’s current priorities.';

  const questions = [
    `What outcomes would make the first six months in the ${role} role successful?`,
    `Which of these role themes are most important right now: ${themeText}?`,
    notes ? 'How does the source context you shared affect this team’s near-term work?' : 'What official company source should you review to understand the team’s current priorities?',
  ];

  return {
    role_themes: roleThemes,
    source_context: notes || null,
    questions_to_investigate: questions,
    evidence_title: evidenceTitle || null,
    outreach: {
      recruiter_message: `Hello, I’m interested in the ${role} opening at ${company}. ${evidenceLine ? `My background includes ${evidenceTitle}: ${evidenceLine} ` : ''}${contextLine} I’d welcome a conversation about whether my experience could help the team.`,
      linkedin_note: `Hi — I’m exploring the ${role} role at ${company}. ${evidenceLine ? `I’ve worked on ${evidenceTitle} and would value connecting to learn more about the team’s priorities.` : 'I’d value connecting to learn more about the team’s priorities.'}`,
      follow_up_email: `Subject: Interest in the ${role} role\n\nHello,\n\nI’m following up on my interest in the ${role} opening at ${company}. ${evidenceLine ? `A relevant part of my background is ${evidenceTitle}: ${evidenceLine} ` : ''}${contextLine} Thank you for your time.`,
    },
  };
}
