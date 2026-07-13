// Minimal, dependency-free DOCX writer for plain-text application materials.
// DOCX is an Open Packaging Convention ZIP; we intentionally generate only
// the three parts Word needs for a basic document and never interpolate text
// as markup.
function xml(value) { return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function crc32(bytes) { let crc = -1; for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); } return (crc ^ -1) >>> 0; }
function u16(value) { return [value & 255, (value >>> 8) & 255]; }
function u32(value) { return [value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255]; }

export function createDocx(text) {
  const encoder = new TextEncoder();
  const paragraphs = String(text).split(/\r?\n/).map((line) => `<w:p><w:r><w:t xml:space="preserve">${xml(line)}</w:t></w:r></w:p>`).join('');
  const parts = [
    ['[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
    ['word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}<w:sectPr/></w:body></w:document>`],
  ].map(([name, content]) => ({ name, nameBytes: encoder.encode(name), data: encoder.encode(content) }));
  let offset = 0; const local = []; const central = [];
  for (const part of parts) { const crc = crc32(part.data); const header = [0x50, 0x4b, 3, 4, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...u32(crc), ...u32(part.data.length), ...u32(part.data.length), ...u16(part.nameBytes.length), 0]; local.push(...header, ...part.nameBytes, ...part.data); central.push(...[0x50, 0x4b, 1, 2, 20, 0, 20, 0, 0, 0, 0, 0, 0, 0, ...u32(crc), ...u32(part.data.length), ...u32(part.data.length), ...u16(part.nameBytes.length), 0, 0, 0, 0, 0, 0, 0, ...u32(offset), ...part.nameBytes]); offset += header.length + part.nameBytes.length + part.data.length; }
  const end = [0x50, 0x4b, 5, 6, 0, 0, 0, 0, ...u16(parts.length), ...u16(parts.length), ...u32(central.length), ...u32(local.length), 0, 0];
  return new Uint8Array([...local, ...central, ...end]);
}
