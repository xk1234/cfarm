---
title: "Importing TikTok Studio data"
description: "Pulling private Studio metrics in with the Chrome companion — how pairing actually works, what the extension captures, where the token comes from, and the failures worth checking."
---

# Importing TikTok Studio data

TikTok's API does not expose the private analytics shown in TikTok Studio. A Chrome extension
reads them from your own logged-in session and posts them back.

`Last tested: 2026-07-25, live against cfarm-eight.vercel.app`

## Workflow summary

### 1. User asks

> "Pull in the Studio numbers for my TikTok posts."

### 2. Agent calls `lumenclip_tiktok_studio_analytics_batch_start`

**In**

```json
{ "integrationIds": ["pf_account_123"], "mode": "new", "recentDays": 90 }
```

`integrationIds` takes 1–50 entries. `mode` is `"new" | "recent" | "all"`, default `"new"`.
`recentDays` is 1–365, default 90, and is used only for `"recent"`.

**Out**

```json
{
  "batchId": "…",
  "status": "pending",
  "postCount": 12,
  "expiresAt": "…",
  "nextActions": [{ "tool": "lumenclip_tiktok_studio_analytics_report", "arguments": { "batchId": "…" } }]
}
```

For a single post, `lumenclip_tiktok_studio_analytics_import_start` takes one `postId` — a
local LumenClip publication id, not a TikTok id.

### 3. Intermediate steps

The batch response includes a companion config: `{ version: 3, endpoint, token, expiresAt }`.
The page hands it to the extension over a **same-origin `window.postMessage`** — there is no
pairing code to copy and no click required inside TikTok.

The extension then drives the browser itself, walking each post across three sections:

```
https://www.tiktok.com/tiktokstudio/analytics/{postId}/{overview|viewers|engagement}
```

It captures by monkey-patching `window.fetch` and `XMLHttpRequest`, cloning responses whose
path is `/aweme/v2/data/insight/` or `/tiktok/v1/analytics/insights/`, and posts each one to:

```
POST /api/tiktok-studio-analytics/capture
Authorization: Bearer <captureToken>
{ "captureId": "…", "studioUrl": "…", "payload": <raw TikTok insight JSON> }
```

The token is an HMAC, not a session. Only `overview` is required — it triggers auto-linking;
`viewers` and `engagement` enrich the same snapshot.

### 4. Agent calls `lumenclip_tiktok_studio_analytics_report`

Every input is optional: `importId`, `batchId`, `postIds` (≤100, accepts local *or* TikTok
ids), `integrationIds` (≤50), `automationId`, `days` (1–3650, default 365), `offset`,
`limit` (1–50, default 20), `historyLimit` (1–10, default 3).

**Out** — `{ generatedAt, scope, pagination, posts[] }`, each post carrying `publication`,
`analytics`, `history[]`, `output`, and a `mapping` block that reports slide-count alignment
between the analytics and the stored slideshow.

### 5. Result

A snapshot lands in `postfast_metric_snapshots` with `source: "tiktok_studio"`, and the
publication gets a canonical public URL written back onto it —
`https://www.tiktok.com/@{username}/{photo|video}/{id}`, using `photo` when the post has
images.

## What gets captured

From TikTok's own insight responses: views, likes, comments, shares, saves, total and average
watch time, full-watch percent, new followers, caption, publish time, photo count. Per slide:
retention percent, like distribution, and peak flags. Plus traffic sources, search terms, and
audience demographics — unique viewers, new/returning split, follower/non-follower split, age,
gender, and country percentages.

## UI workflow

| Step | Action | What happens |
| --- | --- | --- |
| 1 | Press **Download Chrome companion** | Gets `lumenclip-tiktok-studio-analytics.zip` |
| 2 | Load it unpacked in Chrome | *Install or reload version 1.2.0 once. No pairing codes are required.* |
| 3 | Open `/app/analytics` with TikTok selected | Header shows **Sync TikTok Studio** |
| 4 | Choose **Sync scope** | **New posts only**, **Posts from the last 90 days**, **All linked posts** |
| 5 | Press **Create account sync** | Progress cards **Linked posts**, **Captured**, **Saved to LumenClip** |
| 6 | Watch per-item state | **Linked** / `N/3 captured` / **Waiting** |

For one post, `/app/analytics/posts/[id]` offers **Import from TikTok Studio** →
**Start automatic capture**, with captured sections labelled **Overview + slide retention**,
**Viewer demographics**, and **Likes by slide**.

## Failures to check

1. **`TIKTOK_STUDIO_CLOUD_ORIGIN` is not the capture endpoint.** The extension posts to
   `/api/tiktok-studio-analytics/capture` on whichever origin minted its token. That env var
   controls a separate **server-to-server** relay of the finished snapshot, defaulting to a
   hardcoded `https://cfarm-eight.vercel.app`.
2. **The device token lasts a year.** The v3 companion token has a 365-day TTL. Only the
   per-job records expire quickly — 15 minutes for a single import, 60 for a batch.
3. **`APPWRITE_API_KEY` is an accepted signing secret.** The HMAC secret list is
   `[TIKTOK_STUDIO_CAPTURE_SECRET, APPWRITE_API_KEY]`. If the dedicated secret is unset, the
   Appwrite admin key signs long-lived browser tokens. Set `TIKTOK_STUDIO_CAPTURE_SECRET`.
4. **Sections are inferred from payload content, not the URL.** A Viewers page that returns
   nothing yields zero sections and the ingest returns `{ accepted: false }` with no error.
5. **A post with no platform id cannot be captured**:
   `This TikTok publication has no platform post ID. Link its public TikTok URL first.`
6. **Mode `new` can legitimately find nothing**:
   `Every linked TikTok post in this scope already has Studio analytics`.
7. **Payloads over 2,500,000 bytes are rejected** with `413 Capture payload is too large`.
8. **Re-capturing at the same `capturedAt` upserts rather than appends** — snapshot ids are
   derived from `postId` plus `capturedAt`, and re-linking deliberately reuses the existing
   timestamp.
9. **The companion must be detected within 4 seconds**, else
   `Chrome companion not detected. Install or reload the latest companion, then retry.`
10. **Do not confuse this with `lumenclip_tiktok_import_*`.** Those scrape *public* TikTok
    `/photo/` URLs through Apify to match publications; they have nothing to do with the
    extension or with private Studio metrics.

## Additional workflow notes

The extension is MV3, version 1.2.0, with permissions `storage`, `tabs`, `alarms` and host
access to `www.tiktok.com`, the deployed origin, and `localhost`. A one-minute alarm polls for
pending captures; each step has a 30-second timeout and one retry.

Imports and batches are stored in `permanent_assets` under
`tiktok_studio_analytics_import` and `tiktok_studio_analytics_batch`. Publication records are
a JSON string in the `publications` column of `outputs` rows, not a table of their own.

Popup labels are **LumenClip companion**, **TikTok Studio analytics**,
**Open LumenClip to connect**, **Check for pending sync**, **Clear pairing**, with status
defaulting to **Not paired**.

Previous: [Linking a TikTok account](/docs/workflows/link-tiktok-account) ·
Next: [Reading analytics](/docs/workflows/analytics-report)
