---
title: "Reading analytics"
description: "Getting metrics back out — the report call, which metrics each platform actually reports, why absent metrics are omitted rather than zeroed, and the failures worth checking."
---

# Reading analytics

Reading stored performance data across connected accounts, and attributing it back to the
automation that produced the post.

`Last tested: 2026-07-25, live against cfarm-eight.vercel.app`

## Workflow summary

### 1. User asks

> "How did last month's posts do?"

### 2. Agent calls `lumenclip_analytics_report`

Reads stored snapshots. It never refreshes providers.

**In**

```json
{ "days": 30, "postLimit": 50 }
```

That is nearly the whole surface: `days` (1–365, default 30), `postLimit` (1–200, default 50),
`integrationIds` (≤100), and `automationId`. **There is no platform filter, no explicit date
range, and no cohort support.**

**Out**

```json
{
  "generatedAt": "…",
  "since": "…",
  "days": 30,
  "totals": { "views": 12040, "likes": 812, "interactions": 954 },
  "accounts": [
    {
      "integrationId": "pf_account_123",
      "provider": "tiktok",
      "postCount": 9,
      "metrics": { … },
      "newFollowers": 41,
      "followers": 1203,
      "followerChange": 41
    }
  ],
  "posts": [
    {
      "postId": "…",
      "provider": "tiktok",
      "capturedAt": "…",
      "publishedAt": "…",
      "metrics": { … },
      "analyticsSource": "tiktok_studio",
      "studioReportTool": "lumenclip_tiktok_studio_analytics_report"
    }
  ]
}
```

`analyticsSource` defaults to `"postfast"`. `studioReportTool` is only present when the
snapshot came from the Chrome companion, and points at the richer per-slide report.

### 3. Intermediate steps

Two producers write into the same store, discriminated by `source`:

| Source | How it arrives |
| --- | --- |
| `postfast` | A user-triggered sync pulls `/social-posts/analytics` per integration |
| `tiktok_studio` | The Chrome companion pushes captures |

Publication ownership **overrides** the snapshot's own `integrationId`, `provider`,
`publishedAt`, `content`, and `releaseUrl`. Rows are deduped on `integrationId:postId`,
keeping only the latest `capturedAt`, so repeat syncs do not double-count.

### 4. Result

Totals, per-account breakdowns, follower deltas, and per-post rows. Requested integration ids
are force-added even when they have no data, producing accounts with empty metrics.

## Which metrics each platform reports

Only seven providers are seeded. Anything else reports whatever has actually been observed in
stored snapshots.

| Provider | Seeded metrics |
| --- | --- |
| `tiktok` | views, likes, comments, shares, saves, interactions |
| `instagram` | views, impressions, reach, likes, comments, shares, saves, interactions |
| `facebook` | views, impressions, reach, likes, comments, shares, clicks, interactions |
| `youtube` | views, likes, comments, shares, interactions |
| `linkedin` | impressions, reach, likes, comments, shares, clicks, interactions |
| `pinterest` | impressions, views, saves, clicks, interactions |
| `threads` | views, likes, comments, shares, interactions |

`x`, `twitter`, `bluesky`, `telegram`, `google`, `google-business-profile`, and both TikTok
variants have **no seed at all**.

## UI workflow

| Step | Action | What happens |
| --- | --- | --- |
| 1 | Open `/app/analytics` | H1 **Analytics**, subtitle *See audience, distribution, engagement, recent posts, and account health in one view.* |
| 2 | Pick a range | **7 days**, **30 days**, **60 days**, **90 days** |
| 3 | Press **Sync analytics** | Pulls from PostFast, 120-second timeout, then revalidates |
| 4 | Click a post | Opens `/app/analytics/posts/{postId}` |

With no accounts the view reads **No connected social accounts** / *Connect accounts in
Settings, then sync analytics to start building history.* With accounts but no data:
**No stored analytics yet** / *Run Sync analytics now. Each sync appends a snapshot, so trends
become more useful over time.*

## Failures to check

1. **Absent metrics are omitted, never zeroed.** Nothing zero-fills. A missing metric is simply
   not a key. Two exceptions:
   - `interactions` is **always** materialised — computed as likes + comments + shares + saves
     with each term defaulting to 0, so it can legitimately be `0`.
   - `engagementRate` appears only when a denominator (`views`, `impressions`, or `reach`)
     exists and is greater than zero.
2. **`threads` is seeded but unsupported.** It has metrics in the capability table, yet
   `providerSupportsPostAnalytics("threads")` returns `false`.
3. **TikTok, Instagram and YouTube `views` may be a copy of `impressions`.** PostFast exposes
   the primary view total as `impressions` for those three, and a missing `views` is backfilled
   from it. Do not present them as independently measured.
4. **`followers` and `engagementRate` are not summable.** Aggregation deliberately excludes
   both; engagement rate is recomputed from the aggregate rather than averaged.
5. **All three TikTok variants collapse to `tiktok`** in both the MCP normaliser and the
   analytics UI. There is no per-variant reporting.
6. **Nothing polls.** `syncPostFastAnalytics` runs only when a user presses **Sync analytics**
   or something POSTs the route. Studio snapshots arrive only when the extension pushes them.
7. **A store failure renders as "no data".** Both snapshot reads are wrapped in `.catch(() => [])`,
   so an Appwrite outage looks like an empty account rather than an error.
8. **Per-integration sync errors are collected, not thrown, and not displayed.** The POST
   response carries them; the UI shows nothing.
9. **PostFast being unreachable degrades rather than fails.** Integrations are synthesised from
   stored snapshots and named `<Provider> account`. A banner reads *Showing stored analytics.
   Connected accounts could not be refreshed from PostFast right now.*
10. **Follower history failures are swallowed** — it is not available for every provider or
    account type.
11. **An automation with outputs but no linked publications returns a warning, not metrics**:
    *Outputs exist for this automation, but no publication records are linked. Metrics cannot
    be attributed until a publication is linked to its output.*
12. **The UI range select and the route clamp disagree.** The UI offers 7/30/60/90; the route
    accepts 1–365 and also accepts a comma-separated `integrationIds` query the UI never sends.

## Additional workflow notes

Canonical metrics are `views`, `impressions`, `reach`, `likes`, `comments`, `shares`, `saves`,
`clicks`, `followers`, `interactions`, `engagementRate`. Display order puts `interactions`
after `reach`. `shares` is labelled **Reposts** for `x`, `twitter`, and `threads`.

Follower snapshots are deduped per integration per calendar day and capped at 10,000 rows.

A sync also flips a publication to `status: "published"` when PostFast reports a publish date
and the local record has not caught up.

For per-slide retention and audience breakdowns, use
`lumenclip_tiktok_studio_analytics_report` instead — this report intentionally stays at
publication level.

Previous: [Importing TikTok Studio data](/docs/workflows/import-tiktok-studio-data) ·
Next: [Creating a UGC video automation](/docs/workflows/create-ugc-video)
