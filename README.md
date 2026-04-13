# Rijesh Finance v3.2 — Vercel Deployment Guide

## What's in this project

```
rijesh-finance/
├── pages/
│   ├── index.js          ← Main page (loads the app)
│   ├── _app.js           ← Next.js wrapper
│   ├── _document.js      ← HTML head / meta tags
│   └── api/
│       └── kv.js         ← Server-side Upstash Redis proxy
├── components/
│   └── RijeshApp.jsx     ← The full finance tracker app
├── styles/
│   └── globals.css       ← Minimal global reset
├── next.config.js
├── package.json
└── .env.local            ← For local dev only (never commit)
```

---

## Deploy to Vercel (step-by-step)

### Step 1 — Upload to GitHub
1. Create a new GitHub repo (e.g. `rijesh-finance`)
2. Upload / push the contents of this folder to the repo root
   - Do **not** commit `.env.local`

### Step 2 — Import to Vercel
1. Go to [vercel.com](https://vercel.com) → **Add New Project**
2. Import your GitHub repo
3. Framework preset: **Next.js** (auto-detected)
4. Click **Deploy** — it will work immediately (shows app with empty data)

### Step 3 — Add Upstash Redis (so data saves to the cloud)
1. In your Vercel project → **Storage** tab → **Create Database**
2. Choose **Upstash Redis**
3. Give it a name (e.g. `rijesh-kv`) and click **Create & Continue**
4. Vercel automatically injects these environment variables:
   - `KV_REST_API_URL`
   - `KV_REST_API_TOKEN`
5. **Redeploy** your project (Deployments → ⋯ → Redeploy) so the new env vars take effect

That's it. Your app now persists data to Upstash Redis across devices.

---

## Environment Variables

| Variable | Where set | Purpose |
|---|---|---|
| `KV_REST_API_URL` | Vercel (auto via Storage) | Upstash Redis endpoint |
| `KV_REST_API_TOKEN` | Vercel (auto via Storage) | Upstash auth token |
| `NEXT_PUBLIC_WRITE_KEY` | Optional — Vercel or `.env.local` | Default write key (default: `rijesh2025`) |

> **Security:** KV credentials never reach the browser. All Redis calls go through `/api/kv` (a server-side Next.js API route).

---

## Local Development

```bash
npm install
npm run dev
# Open http://localhost:3000
```

For local KV, add to `.env.local`:
```
KV_REST_API_URL=https://your-upstash-url
KV_REST_API_TOKEN=your-token
NEXT_PUBLIC_WRITE_KEY=rijesh2025
```

---

## Default Write Key

The default write key is **`rijesh2025`**

Change it in Settings → Financial Config → "Change Write Key" after unlocking.
