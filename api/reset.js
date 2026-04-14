// api/reset.js — POST: factory reset (write key required)
import { kv, DATA_KEY, defaultData, checkWriteKey, json } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method not allowed' });
  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
  catch { return json(res, 400, { ok: false, error: 'Invalid JSON body' }); }

  if (!checkWriteKey(body?._writeKey)) return json(res, 401, { ok: false, error: 'Invalid write key' });

  try {
    const fresh = defaultData();
    await kv.set(DATA_KEY, fresh);  // write zeros, not delete — so load always returns zeros
    return json(res, 200, { ok: true, data: fresh });
  } catch (err) {
    console.error('[reset]', err);
    return json(res, 500, { ok: false, error: 'Reset failed' });
  }
}
