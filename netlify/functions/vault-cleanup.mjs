import { getStore } from '@netlify/blobs';

const RETENTION_MS = 180 * 24 * 60 * 60 * 1000;

export default async () => {
  const store = getStore('me230-guest-lockers');
  let checked = 0, deleted = 0;
  for await (const page of store.list({ paginate: true })) {
    for (const blob of page.blobs) {
      checked++;
      const record = await store.get(blob.key, { type: 'json' });
      if (!record?.lastActiveAt || Date.now() - Date.parse(record.lastActiveAt) > RETENTION_MS) { await store.delete(blob.key); deleted++; }
    }
  }
  console.log(`Guest locker cleanup checked ${checked} and deleted ${deleted}.`);
  return new Response(JSON.stringify({ checked, deleted }), { headers: { 'content-type': 'application/json' } });
};

export const config = { schedule: '@daily' };
