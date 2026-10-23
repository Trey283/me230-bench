// storage.js — local recovery and encrypted, recovery-code guest lockers.
// Circuit documents are autosaved in IndexedDB. Cloud lockers are encrypted in the browser before they reach Netlify.

export const MEMORY_LIMITS = Object.freeze({
  designs: 10,
  designBytes: 500 * 1024,
  localBytes: 5 * 1024 * 1024,
  // Encrypted data is base64 encoded before it reaches a Netlify Function. Four
  // megabytes keeps the request comfortably below Netlify's 6 MB body limit.
  lockerBytes: 4 * 1024 * 1024,
  snapshots: 3,
  retentionDays: 180,
});

const memoryDbName = 'me230-bench';
const memoryDbVersion = 1;
const memoryAlphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
let memoryDbPromise = null;

const memoryReq = (r) => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error || new Error('Browser storage failed.')); });
function memoryDb() {
  if (!('indexedDB' in globalThis)) return Promise.reject(new Error('This browser does not provide IndexedDB storage.'));
  if (!memoryDbPromise) memoryDbPromise = new Promise((resolve, reject) => {
    const r = indexedDB.open(memoryDbName, memoryDbVersion);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('circuits')) db.createObjectStore('circuits', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error || new Error('Browser storage could not be opened.'));
  });
  return memoryDbPromise;
}
async function memoryObjectStore(name, mode = 'readonly') { const db = await memoryDb(); return db.transaction(name, mode).objectStore(name); }
export function memoryNewId() { return globalThis.crypto?.randomUUID ? crypto.randomUUID() : `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`; }
export const memoryJsonBytes = (value) => new TextEncoder().encode(JSON.stringify(value)).length;

export async function memoryListCircuits() {
  const s = await memoryObjectStore('circuits'), rows = await memoryReq(s.getAll());
  return rows.sort((a, b) => String(b.updated || '').localeCompare(String(a.updated || '')));
}
export async function memoryGetCircuit(id) { return memoryReq((await memoryObjectStore('circuits')).get(id)); }
export async function memoryDeleteCircuit(id) { return memoryReq((await memoryObjectStore('circuits', 'readwrite')).delete(id)); }
export async function memoryPutCircuit(record) {
  if (!record || !record.id || !record.doc) throw new Error('The circuit is missing its storage ID or document.');
  const size = memoryJsonBytes(record.doc);
  if (size > MEMORY_LIMITS.designBytes) throw new Error(`This circuit is ${(size / 1024).toFixed(0)} KB; guest memory allows 500 KB per circuit.`);
  const rows = await memoryListCircuits(), old = rows.find((x) => x.id === record.id);
  if (!old && rows.length >= MEMORY_LIMITS.designs) throw new Error(`Guest memory holds ${MEMORY_LIMITS.designs} circuits. Delete or export one before saving another.`);
  const total = rows.reduce((n, x) => n + (x.id === record.id ? 0 : Number(x.size) || memoryJsonBytes(x.doc)), 0) + size;
  if (total > MEMORY_LIMITS.localBytes) throw new Error('Guest memory is full (5 MB). Delete or export a circuit to make room.');
  const now = new Date().toISOString(), next = { ...old, ...record, name: String(record.name || record.doc.name || 'Untitled circuit').slice(0, 100), size,
    created: old?.created || record.created || now, updated: record.updated || now };
  await memoryReq((await memoryObjectStore('circuits', 'readwrite')).put(next));
  return next;
}
export async function memoryGetSetting(key) { const x = await memoryReq((await memoryObjectStore('settings')).get(key)); return x ? x.value : null; }
export async function memorySetSetting(key, value) { await memoryReq((await memoryObjectStore('settings', 'readwrite')).put({ key, value })); }
export async function memoryDeleteSetting(key) { await memoryReq((await memoryObjectStore('settings', 'readwrite')).delete(key)); }

export function memoryGenerateCode() {
  const b = crypto.getRandomValues(new Uint8Array(20));
  return `ME230-${[0, 4, 8, 12, 16].map((i) => [...b.slice(i, i + 4)].map((v) => memoryAlphabet[v & 31]).join('')).join('-')}`;
}
export function memoryNormalizeCode(value) {
  let s = String(value || '').trim().toUpperCase().replace(/^ME230[-\s]*/i, '').replace(/[-\s]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  if (s.length !== 20 || [...s].some((c) => !memoryAlphabet.includes(c))) throw new Error('Enter the complete ME230 recovery code.');
  return s;
}
export function memoryFormatCode(value) { const s = memoryNormalizeCode(value); return `ME230-${s.match(/.{4}/g).join('-')}`; }
const memoryBytesToB64 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 32768) s += String.fromCharCode(...bytes.subarray(i, i + 32768)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, ''); };
const memoryB64ToBytes = (text) => { const s = String(text).replace(/-/g, '+').replace(/_/g, '/'), raw = atob(s + '='.repeat((4 - s.length % 4) % 4)); return Uint8Array.from(raw, (c) => c.charCodeAt(0)); };
async function memoryCryptoKey(code) {
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`me230-guest-locker-v1:${memoryNormalizeCode(code)}`));
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}
async function memoryVaultToken(code) {
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`me230-guest-locker-id-v1:${memoryNormalizeCode(code)}`));
  return memoryBytesToB64(new Uint8Array(raw));
}
export async function memoryEncryptLocker(locker, code) {
  const plain = new TextEncoder().encode(JSON.stringify(locker));
  if (plain.length > MEMORY_LIMITS.lockerBytes) throw new Error('This guest locker is over its 4 MB limit. Delete circuits or recovery snapshots first.');
  const iv = crypto.getRandomValues(new Uint8Array(12)), data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await memoryCryptoKey(code), plain);
  return { version: 1, iv: memoryBytesToB64(iv), data: memoryBytesToB64(new Uint8Array(data)) };
}
export async function memoryDecryptLocker(envelope, code) {
  if (!envelope || envelope.version !== 1 || typeof envelope.iv !== 'string' || typeof envelope.data !== 'string') throw new Error('The guest locker has an unsupported format.');
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: memoryB64ToBytes(envelope.iv) }, await memoryCryptoKey(code), memoryB64ToBytes(envelope.data));
    const locker = JSON.parse(new TextDecoder().decode(plain));
    if (!locker || locker.format !== 'me230-guest-locker' || !Array.isArray(locker.designs)) throw new Error('bad locker');
    return locker;
  } catch { throw new Error('That recovery code cannot open this guest locker.'); }
}

export const memoryNewLocker = () => ({ format: 'me230-guest-locker', version: 1, updated: new Date().toISOString(), designs: [] });
export const memoryLockerBytes = (locker) => memoryJsonBytes(locker);
export function memoryUpsertLockerDesign(locker, item) {
  const next = JSON.parse(JSON.stringify(locker || memoryNewLocker())), now = new Date().toISOString();
  if (!Array.isArray(next.designs)) next.designs = [];
  const docSize = memoryJsonBytes(item.doc);
  if (docSize > MEMORY_LIMITS.designBytes) throw new Error(`This circuit is ${(docSize / 1024).toFixed(0)} KB; guest lockers allow 500 KB per circuit.`);
  let at = next.designs.findIndex((x) => x.id === item.id), old = at >= 0 ? next.designs[at] : null;
  if (!old && next.designs.length >= MEMORY_LIMITS.designs) throw new Error(`A guest locker holds ${MEMORY_LIMITS.designs} circuits. Delete one before adding another.`);
  const same = old && JSON.stringify(old.doc) === JSON.stringify(item.doc), snapshots = old && Array.isArray(old.snapshots) ? old.snapshots : [];
  if (old && !same) snapshots.unshift({ updated: old.updated, doc: old.doc });
  const row = { id: item.id, name: String(item.name || item.doc.name || 'Untitled circuit').slice(0, 100), updated: item.updated || now, doc: item.doc,
    snapshots: snapshots.slice(0, MEMORY_LIMITS.snapshots) };
  if (at >= 0) next.designs[at] = row; else next.designs.push(row);
  next.designs.sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
  next.updated = now;
  while (memoryLockerBytes(next) > MEMORY_LIMITS.lockerBytes) {
    let pick = null;
    next.designs.forEach((d, di) => d.snapshots.forEach((s, si) => { if (!pick || String(s.updated) < pick.updated) pick = { di, si, updated: String(s.updated) }; }));
    if (!pick) throw new Error('The guest locker is full (4 MB). Delete a circuit before backing up this one.');
    next.designs[pick.di].snapshots.splice(pick.si, 1);
  }
  return next;
}
export function memoryRemoveLockerDesign(locker, id) { const next = JSON.parse(JSON.stringify(locker)); next.designs = next.designs.filter((x) => x.id !== id); next.updated = new Date().toISOString(); return next; }

async function memoryVaultCall(method, code, body) {
  if (!globalThis.location || !/^https?:$/.test(location.protocol)) throw new Error('Online guest lockers are available on the hosted ME230 Bench. Local autosaves still work offline.');
  let res;
  try { res = await fetch('/api/vault', { method, cache: 'no-store', credentials: 'omit', headers: { Authorization: `Bearer ${await memoryVaultToken(code)}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }); }
  catch { throw new Error('The guest locker could not reach Netlify. Your local copy is still safe.'); }
  let data = {}; try { data = await res.json(); } catch { /* an upstream error can be plain text */ }
  if (!res.ok) { const e = new Error(data.error || `Guest locker request failed (${res.status}).`); e.status = res.status; e.code = data.code; e.revision = data.revision; throw e; }
  return data;
}
export async function memoryCreateVault(code, locker = memoryNewLocker()) { return memoryVaultCall('POST', code, { payload: await memoryEncryptLocker(locker, code) }); }
export async function memoryLoadVault(code) { const r = await memoryVaultCall('GET', code); return { locker: await memoryDecryptLocker(r.payload, code), revision: r.revision }; }
export async function memorySaveVault(code, locker, revision) { return memoryVaultCall('PUT', code, { revision, payload: await memoryEncryptLocker(locker, code) }); }
export async function memoryDeleteVault(code) { return memoryVaultCall('DELETE', code); }
