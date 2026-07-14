// Grounded packet drafts: no invented achievements. Messages only use the job
// identity and explicitly mark claims that require the user's evidence.
export function createPacketDrafts({ job = {}, application = {}, careerEvidence = [] } = {}) {
  const company = job.company || 'the company';
  const title = job.title || 'this role';
  const evidence = application.tailored_resume ? 'Source: tailored resume for this job.' : 'Needs user input: tailor and review your resume first.';
  const confirmed = careerEvidence.find((item) => item?.review_status === 'user_confirmed' && item.evidence_text?.trim());
  const shortAnswer = confirmed
    ? `I’m interested in the ${title} role because [add a specific connection to the team, product, or mission]. My relevant experience includes ${confirmed.title || 'a verified accomplishment'}: ${confirmed.evidence_text.trim()}`
    : `I’m interested in the ${title} role because [add a specific connection to the team, product, or mission]. My relevant experience is [add verified example].`;
  const shortAnswerEvidence = confirmed
    ? `User-confirmed career evidence: ${confirmed.title || 'Verified accomplishment'}. Review relevance and wording before submitting.`
    : 'Needs user input: add a real, role-relevant example before submitting.';
  return [
    { item_type: 'tailored_resume', label: 'Tailored resume', draft_content: application.tailored_resume || '', source_evidence: evidence },
    { item_type: 'cover_letter', label: 'Cover letter', draft_content: application.cover_letter || '', source_evidence: evidence },
    { item_type: 'recruiter_message', label: 'Recruiter message', draft_content: `Hello, I’m interested in the ${title} role at ${company}. I’d welcome the chance to discuss how my relevant experience could support the team.`, source_evidence: 'Grounded only in the job title and company; add your specific evidence before sending.' },
    { item_type: 'linkedin_note', label: 'LinkedIn connection note', draft_content: `Hi — I’m exploring the ${title} opening at ${company} and would value connecting.`, source_evidence: 'Grounded only in the job title and company; personalize before sending.' },
    { item_type: 'short_answer', label: 'Why are you interested?', draft_content: shortAnswer, source_evidence: shortAnswerEvidence },
  ];
}
