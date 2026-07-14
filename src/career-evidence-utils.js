const MAX_EVIDENCE_ITEMS = 8;
const MAX_EVIDENCE_CHARS = 6000;
const MAX_GUIDANCE_CHARS = 1200;

// Formats only user-confirmed records for model context. The system prompt
// still treats this as evidence, not instructions, and never permits claims
// beyond the resume plus these reviewed entries.
export function formatCareerContext({ evidence = [], writingGuidance = {} } = {}) {
  const confirmed = evidence
    .filter((item) => item?.review_status === 'user_confirmed' && String(item.evidence_text || '').trim())
    .slice(0, MAX_EVIDENCE_ITEMS);
  let remaining = MAX_EVIDENCE_CHARS;
  const evidenceLines = [];
  for (const item of confirmed) {
    const line = `- ${String(item.title || 'Verified evidence').trim()}: ${String(item.evidence_text).trim()}${item.skills?.length ? ` (skills: ${item.skills.join(', ')})` : ''}`;
    if (line.length > remaining) break;
    evidenceLines.push(line);
    remaining -= line.length;
  }
  const guidance = {
    tone: String(writingGuidance.tone || '').trim().slice(0, MAX_GUIDANCE_CHARS),
    focus_areas: String(writingGuidance.focus_areas || '').trim().slice(0, MAX_GUIDANCE_CHARS),
    phrases_to_avoid: String(writingGuidance.phrases_to_avoid || '').trim().slice(0, MAX_GUIDANCE_CHARS),
  };
  const guidanceLines = [
    guidance.tone && `Preferred tone: ${guidance.tone}`,
    guidance.focus_areas && `Emphasize when truthful and relevant: ${guidance.focus_areas}`,
    guidance.phrases_to_avoid && `Avoid these phrases when possible: ${guidance.phrases_to_avoid}`,
  ].filter(Boolean);
  return {
    confirmedCount: evidenceLines.length,
    evidenceText: evidenceLines.length ? evidenceLines.join('\n') : 'No user-confirmed career evidence was saved.',
    guidanceText: guidanceLines.length ? guidanceLines.join('\n') : 'No writing guidance was saved.',
  };
}
