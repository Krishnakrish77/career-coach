const labels = { name: ['name', 'full name'], email: ['email'], phone: ['phone', 'mobile'], linkedin: ['linkedin'], portfolio: ['portfolio', 'website'], cover_letter: ['cover letter'] };

// Fields sharing a type can still be genuinely different questions — "First
// Name" and "Last Name" both match type 'name'; two different essay prompts
// both match the 'text_answer' catch-all. groupKey distinguishes them by
// their own label/placeholder/name so callers don't collapse distinct
// fields into a single prompted value. Truly identical fields (no
// distinguishing text) still share a key, which is the correct behavior for
// something like a repeated "confirm email" field.
export function detectApplicationFields(fields = []) {
  return fields.map((field) => {
    const text = `${field.name || ''} ${field.id || ''} ${field.label || ''} ${field.placeholder || ''}`.toLowerCase();
    const type = Object.entries(labels).find(([, terms]) => terms.some((term) => text.includes(term)))?.[0] || (field.tag === 'textarea' ? 'text_answer' : null);
    if (!type) return null;
    const distinguisher = (field.label || field.placeholder || field.name || field.id || '').trim().toLowerCase();
    const groupKey = distinguisher ? `${type}::${distinguisher}` : type;
    return { ...field, type, confidence: field.label ? 'high' : 'medium', groupKey };
  }).filter(Boolean);
}
