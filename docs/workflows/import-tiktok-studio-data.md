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
  "nextActions": [
    {
      "tool": "lumenclip_tiktok_studio_analytics_report",
      "arguments": { "batchId": "…" }
    }
  ]
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

Every input is optional: `importId`, `batchId`, `postIds` (≤100, accepts local _or_ TikTok
ids), `integrationIds` (≤50), `automationId`, `days` (1–3650, default 365), `offset`,
`limit` (1–50, default 20), `historyLimit` (1–10, default 3).

**Out** — `{ generatedAt, scope, pagination, counts, posts[] }`, each post carrying `publication`,
`analytics`, `history[]`, `output`, and a `mapping` block that reports slide-count alignment
between the analytics and the stored slideshow.

The report is publication-first: every linked TikTok is returned even when it
has not been captured. `counts.withMetrics` and `counts.awaitingCapture` make
that gap explicit. A publication with no import uses
`analytics.state: "not_requested"` plus a `statusReason`; a timed-out companion
attempt uses `analytics.state: "failed"` and includes the persisted section,
reason, and failure timestamp. Waiting/capturing/ready imports retain their
normal import states.

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

| Step | Action                                                            | What happens                                                                                                                                                             |
| ---- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | Press **Download Chrome companion**                               | Gets `lumenclip-companion.zip`                                                                                                                                           |
| 2    | Remove any older LumenClip extension, then load this one unpacked | _Use version 2.1.0 for the in-extension comment review surface. Leaving an older copy loaded can run two capture workers against `www.tiktok.com`._                    |
| 3    | Open `/app/analytics` with TikTok selected                        | Header shows **Sync TikTok Studio**                                                                                                                                      |
| 4    | Choose **Sync scope**                                             | **New posts only**, **Posts from the last 90 days**, **All linked posts**                                                                                                |
| 5    | Press **Create account sync**                                     | Progress cards **Linked posts**, **Captured**, **Saved to LumenClip**                                                                                                    |
| 6    | Watch per-item state                                              | **Linked** / `N/3 captured` / **Waiting** / **Failed · section**                                                                                                         |

After one retry, a section timeout is persisted on the import with its section,
reason, and timestamp. A batch whose remaining items failed finishes as
`partial` instead of staying indistinguishably `waiting`; starting a later
`new` sync retries posts that still have no snapshot.

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
   `[TIKTOK_STUDIO_CAPTURE_SECRET, APPWRITE_API_KEY]`, and signing always uses the _first_
   entry. If the dedicated secret is unset, the Appwrite admin key signs long-lived browser
   tokens — and rotating that key silently invalidates every companion pairing. Set
   `TIKTOK_STUDIO_CAPTURE_SECRET` in every environment that mints tokens.
4. **`Invalid capture token` means the signing secret moved, not that the token expired.**
   Expiry produces `Capture token is invalid or expired`; a bare `Invalid capture token` is a
   failed signature check, so the token was minted under a secret this environment no longer
   holds — commonly a token minted against localhost and used against production, or one minted
   before `TIKTOK_STUDIO_CAPTURE_SECRET` was introduced. It cannot be recovered; reconnect.
   From version 2.0.0 the companion detects this, drops the dead pairing itself, and shows
   **Connect** rather than stranding you in a paired state where every action fails.
5. **Sections are inferred from payload content, not the URL.** A Viewers page that returns
   nothing yields zero sections and the ingest returns `{ accepted: false }` with no error.
6. **A post with no platform id cannot be captured**:
   `This TikTok publication has no platform post ID. Link its public TikTok URL first.`
7. **Mode `new` can legitimately find nothing**:
   `Every linked TikTok post in this scope already has Studio analytics`.
8. **Payloads over 2,500,000 bytes are rejected** with `413 Capture payload is too large`.
9. **Re-capturing at the same `capturedAt` upserts rather than appends** — snapshot ids are
   derived from `postId` plus `capturedAt`, and re-linking deliberately reuses the existing
   timestamp.
10. **The companion must be detected within 4 seconds**, else
    `Chrome companion not detected. Install or reload the latest companion, then retry.`
11. **Do not confuse this with `lumenclip_tiktok_import_*`.** Those scrape _public_ TikTok
    `/photo/` URLs through Apify to match publications; they have nothing to do with the
    extension or with private Studio metrics.

## Additional workflow notes

The companion is one MV3 extension, version 2.1.0, covering **both** Studio analytics and
comment replies. It lives in `browser-extension/` with permissions
`storage`, `tabs`, `alarms` and host
access to `www.tiktok.com`, the deployed origin, and `localhost`. A one-minute alarm polls for
pending captures; each step has a 30-second timeout and one retry.

Imports and batches are stored in `permanent_assets` under
`tiktok_studio_analytics_import` and `tiktok_studio_analytics_batch`. Publication records are
a JSON string in the `publications` column of `outputs` rows, not a table of their own.

Popup labels are **LumenClip companion**, **TikTok Studio analytics**,
**Open LumenClip to connect**, **Check for pending sync**, **Clear pairing**, with status
defaulting to **Not paired**.

Previous: [Linking a TikTok account](/docs/workflows/link-tiktok-account) ·
Next: [Reviewing unlinked TikToks](/docs/workflows/review-unlinked-tiktoks)
