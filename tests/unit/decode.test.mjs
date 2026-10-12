import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { explode, decodeMs14 } from '../../src/decode.js';
import { ROOT, fixtures, readFixture } from '../helpers.mjs';

const golden = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/golden/xml-sha256.json'), 'utf8'));
const sha = (s) => crypto.createHash('sha256').update(Buffer.from(s, 'latin1')).digest('hex');

test('zlib blast reference vector (uncoded literals, 1 KB dictionary)', () => {
  const pk = fs.readFileSync(path.join(ROOT, 'tests/fixtures/blast-test.pk'));
  const want = fs.readFileSync(path.join(ROOT, 'tests/fixtures/blast-test.txt'), 'latin1');
  assert.equal(Buffer.from(explode(pk, want.length)).toString('latin1'), want);
});

test('every ME230 file decodes byte-for-byte like the C reference decoder', () => {
  const names = fixtures();
  assert.equal(names.length, 46);
  for (const n of names) assert.equal(sha(decodeMs14(readFixture(n))), golden[n], n);
});

test('decoded XML is a Multisim workbench document', () => {
  const x = decodeMs14(readFixture('Design7'));
  assert.match(x, /^<\?xml version="1.0" encoding="ASCII"\?>\s*<MSMElectronicsWorkbench/);
});

test('plain-XML input passes through', () => {
  assert.equal(decodeMs14(Buffer.from('<?xml version="1.0"?><a/>')), '<?xml version="1.0"?><a/>');
});

const bad = (buf, re) => assert.throws(() => decodeMs14(buf), (e) => { assert.match(e.message, re); return true; });
test('rejects files that are not Multisim circuits', () => {
  bad(Buffer.from('PK\x03\x04 a zip file'), /isn.t a Multisim file/);
  bad(Buffer.alloc(0), /isn.t a Multisim file/);
  bad(Buffer.from('%PDF-1.7'), /isn.t a Multisim file/);
});
test('rejects truncated files with a clear message', () => {
  const f = readFixture('Design7');
  for (const cut of [37, 50, 60, 200, Math.floor(f.length / 2), f.length - 1]) bad(f.subarray(0, cut), /cut short|damaged|Corrupt|longer than/);
});
test('rejects corrupted compressed data instead of returning garbage', () => {
  const f = Buffer.from(readFixture('Design38'));
  let threw = 0;
  for (const pos of [60, 500, 5000, 20000, 39000]) {
    const g = Buffer.from(f); g[pos] ^= 0xff;
    try { const x = decodeMs14(g); if (sha(x) !== golden['Design38']) threw++; } catch { threw++; }
  }
  assert.equal(threw, 5, 'every flipped byte must either throw or visibly change the output');
});
test('rejects an impossible header size', () => {
  const f = Buffer.from(readFixture('Design38')); f.writeUInt32LE(0xffffffff, 36); bad(f, /unreadable header/);
  const g = Buffer.from(readFixture('Design38')); g.writeUInt32LE(0, 36); bad(g, /unreadable header/);
});
test('explode refuses a bad stream header', () => {
  assert.throws(() => explode(Uint8Array.from([7, 6, 0, 0]), 10), /Not PKWARE/);
  assert.throws(() => explode(Uint8Array.from([1, 9, 0, 0]), 10), /Not PKWARE/);
});
