const labels = { name: ['name', 'full name'], email: ['email'], phone: ['phone', 'mobile'], linkedin: ['linkedin'], portfolio: ['portfolio', 'website'], cover_letter: ['cover letter'] };
export function detectApplicationFields(fields = []) {
  return fields.map((field) => {
    const text = `${field.name || ''} ${field.id || ''} ${field.label || ''} ${field.placeholder || ''}`.toLowerCase();
    const type = Object.entries(labels).find(([, terms]) => terms.some((term) => text.includes(term)))?.[0] || (field.tag === 'textarea' ? 'text_answer' : null);
    return type ? { ...field, type, confidence: field.label ? 'high' : 'medium' } : null;
  }).filter(Boolean);
}
