// api/verify.js — POST: verify write key
import { checkWriteKey, json } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method not allowed' });
  let key;
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    key = body?._writeKey;
  } catch { return json(res, 400, { ok: false, error: 'Invalid request body' }); }

  if (!key || typeof key !== 'string' || key.length > 256)
    return json(res, 400, { ok: false, error: 'Missing or invalid key' });

  return checkWriteKey(key)
    ? json(res, 200, { ok: true })
    : json(res, 401, { ok: false, error: 'Incorrect write key. Try again.' });
}
