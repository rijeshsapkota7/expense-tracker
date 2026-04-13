// api/save.js — POST: save data (write key required)
import { kv, DATA_KEY, checkWriteKey, validateData, sanitiseData, json } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method not allowed' });
  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
  catch { return json(res, 400, { ok: false, error: 'Invalid JSON body' }); }

  const { _writeKey, ...rawData } = body ?? {};
  if (!checkWriteKey(_writeKey)) return json(res, 401, { ok: false, error: 'Invalid write key' });
  if (!validateData(rawData))    return json(res, 422, { ok: false, error: 'Data validation failed' });

  const clean = sanitiseData(rawData);
  try {
    await kv.set(DATA_KEY, clean);
    return json(res, 200, { ok: true, data: clean });
  } catch (err) {
    console.error('[save]', err);
    return json(res, 500, { ok: false, error: 'Failed to save data' });
  }
}
