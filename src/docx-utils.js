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
  ].map(([name, content]) => ({ nameBytes: encoder.encode(name), data: encoder.encode(content) }));

  const local = [];
  const central = [];

  for (const part of parts) {
    const crc = crc32(part.data);
    const localOffset = local.length;

    // Local file header: ZIP spec fixed part is exactly 30 bytes, then the
    // filename, then the raw (uncompressed/"stored") data.
    local.push(
      0x50, 0x4b, 0x03, 0x04, // local file header signature
      20, 0, // version needed to extract
      ...u16(0), // general purpose bit flag
      ...u16(0), // compression method (0 = stored)
      ...u16(0), // last mod file time
      ...u16(0), // last mod file date
      ...u32(crc),
      ...u32(part.data.length), // compressed size (== uncompressed; stored)
      ...u32(part.data.length), // uncompressed size
      ...u16(part.nameBytes.length),
      ...u16(0), // extra field length
      ...part.nameBytes,
      ...part.data,
    );

    // Central directory file header: fixed part is exactly 46 bytes, then
    // the filename. No extra field, comment, or data here.
    central.push(
      0x50, 0x4b, 0x01, 0x02, // central file header signature
      20, 0, // version made by
      20, 0, // version needed to extract
      ...u16(0), // general purpose bit flag
      ...u16(0), // compression method
      ...u16(0), // last mod file time
      ...u16(0), // last mod file date
      ...u32(crc),
      ...u32(part.data.length),
      ...u32(part.data.length),
      ...u16(part.nameBytes.length),
      ...u16(0), // extra field length
      ...u16(0), // file comment length
      ...u16(0), // disk number start
      ...u16(0), // internal file attributes
      ...u32(0), // external file attributes
      ...u32(localOffset),
      ...part.nameBytes,
    );
  }

  const centralDirectoryOffset = local.length;
  const end = [
    0x50, 0x4b, 0x05, 0x06, // end of central directory signature
    ...u16(0), // number of this disk
    ...u16(0), // disk where central directory starts
    ...u16(parts.length), // central directory records on this disk
    ...u16(parts.length), // total central directory records
    ...u32(central.length), // size of the central directory
    ...u32(centralDirectoryOffset), // offset of start of central directory
    ...u16(0), // comment length
  ];

  return new Uint8Array([...local, ...central, ...end]);
}
