import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MEMORY_LIMITS, memoryGenerateCode, memoryNormalizeCode, memoryFormatCode,
  memoryEncryptLocker, memoryDecryptLocker, memoryNewLocker, memoryUpsertLockerDesign,
  memoryCreateVault,
} from '../../src/storage.js';

test('guest recovery codes are strong, formatted, and typo tolerant', () => {
  const code = memoryGenerateCode();
  assert.match(code, /^ME230-(?:[0-9A-HJKMNP-TV-Z]{4}-){4}[0-9A-HJKMNP-TV-Z]{4}$/);
  const normalized = memoryNormalizeCode(code);
  assert.equal(normalized.length, 20);
  assert.equal(memoryFormatCode(normalized), code);
  assert.equal(memoryNormalizeCode('me230-oooo-iiii-llll-0000-1111'), '00001111111100001111');
  assert.throws(() => memoryNormalizeCode('too-short'), /complete ME230 recovery code/);
});

test('guest lockers encrypt and decrypt entirely on the client', async () => {
  const code = memoryGenerateCode(), locker = memoryNewLocker();
  locker.designs.push({ id: 'one', name: 'Quiz review', updated: new Date().toISOString(), doc: { name: 'Quiz review', parts: [], wires: [] }, snapshots: [] });
  const encrypted = await memoryEncryptLocker(locker, code);
  assert.equal(encrypted.version, 1);
  assert.ok(!encrypted.data.includes('Quiz review'));
  assert.deepEqual(await memoryDecryptLocker(encrypted, code), locker);
  await assert.rejects(memoryDecryptLocker(encrypted, memoryGenerateCode()), /cannot open this guest locker/);
});

test('the locker API receives a separate lookup token, never the recovery code', async () => {
  const oldLocation = globalThis.location, oldFetch = globalThis.fetch, code = memoryGenerateCode();
  let authorization = '';
  globalThis.location = { protocol: 'https:' };
  globalThis.fetch = async (_url, options) => { authorization = options.headers.Authorization; return new Response(JSON.stringify({ revision: 1 }), { status: 201, headers: { 'content-type': 'application/json' } }); };
  try { await memoryCreateVault(code); } finally { globalThis.location = oldLocation; globalThis.fetch = oldFetch; }
  const token = authorization.replace(/^Bearer /, '');
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.ok(!authorization.includes(memoryNormalizeCode(code)));
});

test('guest lockers keep the three previous versions', () => {
  let locker = memoryNewLocker();
  for (let value = 0; value < 5; value++) locker = memoryUpsertLockerDesign(locker, {
    id: 'circuit-1', name: 'Loop circuit', updated: new Date(2026, 0, value + 1).toISOString(),
    doc: { name: 'Loop circuit', parts: [{ id: 1, ref: 'R1', value }], wires: [] },
  });
  assert.equal(locker.designs.length, 1);
  assert.equal(locker.designs[0].doc.parts[0].value, 4);
  assert.equal(locker.designs[0].snapshots.length, MEMORY_LIMITS.snapshots);
  assert.deepEqual(locker.designs[0].snapshots.map((x) => x.doc.parts[0].value), [3, 2, 1]);
});

test('a guest locker is limited to ten circuit records', () => {
  let locker = memoryNewLocker();
  for (let i = 0; i < MEMORY_LIMITS.designs; i++) locker = memoryUpsertLockerDesign(locker, {
    id: `circuit-${i}`, name: `Circuit ${i}`, doc: { name: `Circuit ${i}`, parts: [], wires: [] },
  });
  assert.throws(() => memoryUpsertLockerDesign(locker, { id: 'one-too-many', name: 'Extra', doc: { name: 'Extra', parts: [], wires: [] } }), /holds 10 circuits/);
});
