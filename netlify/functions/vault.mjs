import { createHash } from 'node:crypto';
import { getStore } from '@netlify/blobs';

const STORE = 'me230-guest-lockers';
const RETENTION_MS = 180 * 24 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 5_800_000;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

const reply = (status, value) => new Response(value === null ? null : JSON.stringify(value), { status, headers });
const expired = (record) => !record?.lastActiveAt || Date.now() - Date.parse(record.lastActiveAt) > RETENTION_MS;
const validPayload = (p) => p && p.version === 1 && typeof p.iv === 'string' && p.iv.length < 100 && typeof p.data === 'string';
function tokenFrom(request) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  return TOKEN.test(token) ? token : null;
}
const keyFor = (token) => createHash('sha256').update(`me230-vault-v1:${token}`).digest('hex');
async function bodyOf(request) {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > MAX_BODY_BYTES) throw Object.assign(new Error('The guest locker is too large.'), { status: 413 });
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) throw Object.assign(new Error('The guest locker is too large.'), { status: 413 });
  try { return JSON.parse(text); } catch { throw Object.assign(new Error('The guest locker request is not valid JSON.'), { status: 400 }); }
}

export default async (request) => {
  const token = tokenFrom(request);
  if (!token) return reply(401, { error: 'A valid guest locker token is required.' });
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return reply(403, { error: 'Cross-site guest locker requests are not allowed.' });

  const store = getStore(STORE), key = keyFor(token), method = request.method.toUpperCase();
  try {
    if (method === 'POST') {
      const body = await bodyOf(request);
      if (!validPayload(body.payload)) return reply(400, { error: 'The encrypted guest locker is malformed.' });
      const now = new Date().toISOString();
      const result = await store.setJSON(key, { version: 1, createdAt: now, lastActiveAt: now, revision: 1, payload: body.payload }, { onlyIfNew: true });
      return result.modified ? reply(201, { revision: 1 }) : reply(409, { error: 'A guest locker already uses this recovery code.', code: 'exists' });
    }

    const entry = await store.getWithMetadata(key, { type: 'json' });
    if (!entry) return reply(404, { error: 'No guest locker was found for that recovery code.', code: 'not_found' });
    const record = entry.data;
    if (expired(record)) { await store.delete(key); return reply(410, { error: 'This guest locker expired after 180 days without activity.', code: 'expired' }); }

    if (method === 'GET') {
      const now = new Date().toISOString();
      if (Date.now() - Date.parse(record.lastActiveAt) > 24 * 60 * 60 * 1000) {
        await store.setJSON(key, { ...record, lastActiveAt: now }, { onlyIfMatch: entry.etag });
      }
      return reply(200, { revision: record.revision, payload: record.payload });
    }
    if (method === 'PUT') {
      const body = await bodyOf(request);
      if (!validPayload(body.payload) || !Number.isInteger(body.revision)) return reply(400, { error: 'The encrypted guest locker or revision is malformed.' });
      if (body.revision !== record.revision) return reply(409, { error: 'The guest locker changed on another browser. Refresh and try again.', code: 'revision', revision: record.revision });
      const next = { ...record, lastActiveAt: new Date().toISOString(), revision: record.revision + 1, payload: body.payload };
      const result = await store.setJSON(key, next, { onlyIfMatch: entry.etag });
      return result.modified ? reply(200, { revision: next.revision }) : reply(409, { error: 'The guest locker changed on another browser. Refresh and try again.', code: 'revision' });
    }
    if (method === 'DELETE') { await store.delete(key); return reply(200, { deleted: true }); }
    return reply(405, { error: 'Method not allowed.' });
  } catch (error) {
    console.error('guest locker request failed', error);
    return reply(error.status || 500, { error: error.status ? error.message : 'The guest locker service had a problem. Your local copy is still safe.' });
  }
};

export const config = {
  path: '/api/vault',
  rateLimit: { action: 'rate_limit', aggregateBy: ['domain', 'ip'], windowLimit: 60, windowSize: 60 },
};
