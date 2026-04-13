// api/load.js — GET: load data (public, no key needed)
import { kv, DATA_KEY, defaultData, json } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'Method not allowed' });
  try {
    const raw  = await kv.get(DATA_KEY);
    const data = raw ?? defaultData();
    return json(res, 200, { ok: true, data });
  } catch (err) {
    console.error('[load]', err);
    return json(res, 500, { ok: false, error: 'Failed to load data' });
  }
}
