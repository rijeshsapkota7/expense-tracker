/**
 * /api/kv — thin proxy to Vercel/Upstash KV so the browser never
 * holds the KV token. All reads/writes go through this route.
 *
 * Vercel Upstash integration injects:
 *   KV_REST_API_URL  and  KV_REST_API_TOKEN
 * as environment variables automatically when you add Storage → Upstash Redis
 * in the Vercel Dashboard.
 */

const KEY = "rijesh_finance_v3";

async function kvRequest(path, method = "GET", body) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;

  if (!url || !token) return { ok: false, error: "KV not configured" };

  const opts = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);

  const res = await fetch(`${url}${path}`, opts);
  if (!res.ok) return { ok: false, error: `KV HTTP ${res.status}` };
  const json = await res.json();
  return { ok: true, data: json };
}

export default async function handler(req, res) {
  // CORS headers (same-origin only in production is fine; set for dev convenience)
  res.setHeader("Cache-Control", "no-store");

  try {
    if (req.method === "GET") {
      // GET /api/kv  →  read the stored data blob
      const r = await kvRequest(`/get/${encodeURIComponent(KEY)}`);
      if (!r.ok) return res.status(200).json({ value: null, kvError: r.error });
      const raw = r.data?.result;
      if (!raw) return res.status(200).json({ value: null });
      // stored as double-stringified JSON — parse safely
      let parsed;
      try { parsed = typeof raw === "string" ? JSON.parse(raw) : raw; } catch { parsed = null; }
      return res.status(200).json({ value: parsed });
    }

    if (req.method === "POST") {
      const { action, data } = req.body || {};

      if (action === "set") {
        // Save entire data blob
        const payload = JSON.stringify(data);
        const r = await kvRequest(`/set/${encodeURIComponent(KEY)}`, "POST", payload);
        if (!r.ok) return res.status(500).json({ ok: false, error: r.error });
        return res.status(200).json({ ok: true });
      }

      if (action === "del") {
        const r = await kvRequest(`/del/${encodeURIComponent(KEY)}`, "POST");
        if (!r.ok) return res.status(500).json({ ok: false, error: r.error });
        return res.status(200).json({ ok: true });
      }

      return res.status(400).json({ ok: false, error: "Unknown action" });
    }

    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    console.error("[/api/kv]", err);
    return res.status(500).json({ ok: false, error: String(err) });
  }
}
