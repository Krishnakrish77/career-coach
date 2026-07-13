import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDocx } from '../src/docx-utils.js';

function readU16(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readU32(bytes, offset) {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

// Walks the actual ZIP structure (end-of-central-directory -> central
// directory -> each local file header) rather than just checking the first
// few bytes — a previous version of createDocx passed a shallow byte-count
// check while producing a file `unzip` rejected outright.
function assertValidZip(bytes) {
  const eocdOffset = bytes.length - 22;
  assert.deepEqual([...bytes.slice(eocdOffset, eocdOffset + 4)], [0x50, 0x4b, 0x05, 0x06], 'end of central directory signature');

  const entryCount = readU16(bytes, eocdOffset + 10);
  const centralDirSize = readU32(bytes, eocdOffset + 12);
  const centralDirOffset = readU32(bytes, eocdOffset + 16);
  assert.equal(centralDirOffset + centralDirSize, eocdOffset, 'central directory should end exactly where the EOCD record starts');

  let cursor = centralDirOffset;
  for (let i = 0; i < entryCount; i += 1) {
    assert.deepEqual([...bytes.slice(cursor, cursor + 4)], [0x50, 0x4b, 0x01, 0x02], `central directory entry ${i} signature`);
    const nameLength = readU16(bytes, cursor + 28);
    const localHeaderOffset = readU32(bytes, cursor + 42);
    assert.deepEqual(
      [...bytes.slice(localHeaderOffset, localHeaderOffset + 4)],
      [0x50, 0x4b, 0x03, 0x04],
      `local file header for entry ${i} signature`,
    );
    cursor += 46 + nameLength;
  }
  assert.equal(cursor, eocdOffset, 'central directory entries should exactly fill the declared central directory size');
}

test('createDocx produces a structurally valid single-disk ZIP', () => {
  const file = createDocx('A & B\nSecond line');
  assertValidZip(file);
});

test('createDocx escapes XML-significant characters in the document body', () => {
  const file = createDocx('<script>alert(1)</script> & "quotes"');
  const text = new TextDecoder().decode(file);
  assert.ok(text.includes('&lt;script&gt;'));
  assert.ok(!text.includes('<script>alert'));
});
