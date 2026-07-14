const labels = [
  ['first_name', ['first name', 'firstname', 'first_name', 'given name']],
  ['last_name', ['last name', 'lastname', 'last_name', 'family name', 'surname']],
  ['email', ['email']],
  ['phone', ['phone', 'mobile']],
  ['linkedin', ['linkedin']],
  ['portfolio', ['portfolio', 'website', 'personal site']],
  ['cover_letter', ['cover letter']],
];

// Fields sharing a type can still be genuinely different questions — "First
// Name" and "Last Name" both match type 'name'; two different essay prompts
// both match the 'text_answer' catch-all. groupKey distinguishes them by
// their own label/placeholder/name so callers don't collapse distinct
// fields into a single prompted value. Truly identical fields (no
// distinguishing text) still share a key, which is the correct behavior for
// something like a repeated "confirm email" field.
export function detectApplicationFields(fields = []) {
  return fields.map((field) => {
    const parts = [field.name, field.id, field.label, field.placeholder].map((value) => String(value || '').trim().toLowerCase());
    const text = parts.join(' ');
    // "name" is intentionally exact: a username field must never receive a
    // person's full name merely because the string contains "name".
    const isFullName = parts.some((value) => ['name', 'full name', 'full_name', 'fullname'].includes(value));
    const type = labels.find(([, terms]) => terms.some((term) => text.includes(term)))?.[0] || (isFullName ? 'name' : (field.tag === 'textarea' ? 'text_answer' : null));
    if (!type) return null;
    const distinguisher = (field.label || field.placeholder || field.name || field.id || '').trim().toLowerCase();
    const groupKey = distinguisher ? `${type}::${distinguisher}` : type;
    return { ...field, type, confidence: field.label ? 'high' : 'medium', groupKey };
  }).filter(Boolean);
}
