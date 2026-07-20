---
title: "Analyze content performance [User]"
description: "Sync cross-platform metrics, compare accounts and posts, and turn the results into content decisions."
---

## Outcome

You use the Analytics dashboard to identify top posts, underperformers, account
trends, and content-source patterns, then turn those observations into specific
automation changes.

This is currently **performance analysis**, not an AI semantic critique of the
copy or creative. The dashboard reports provider metrics and attribution; the
user supplies the editorial interpretation.

## Before you start

- Connect at least one PostFast-supported social account.
- Publish posts through LumenClip or ensure external posts are returned by the
  provider analytics API.
- Allow time for platform metrics to become available.
- For trend charts, collect at least two analytics snapshots on different
  dates. One sync produces a point, not a curve.

## 1. Open Analytics and choose the comparison window

1. Open **Analytics** from the workspace sidebar.
2. Choose **7**, **30**, **60**, or **90 days**.
3. Select **All connected accounts** for a portfolio view or choose one account
   for a focused analysis.

![Analytics overview and first-sync state](/docs/workflows/content-analysis-01-overview.jpg)

## 2. Sync current metrics

1. Select **Sync analytics**.
2. Wait for the refresh to finish. The app requests post analytics and follower
   history for each selected integration.
3. Review any per-account sync errors instead of treating missing provider data
   as zero performance.
4. Repeat on a later day to build snapshot history.

Each sync appends metric and follower snapshots; it does not replace the prior
history.

## 3. Read the overview

Use **Overview** to compare:

- views or impressions;
- total interactions;
- posts published in the selected range;
- net follower change;
- account reporting availability;
- highest-reach posts;
- underperforming posts worth reviewing.

Do not compare raw reach across accounts without considering audience size,
posting volume, platform, and the selected time window.

## 4. Analyze one account

1. Select an account card or switch to **Account**.
2. Choose a supported metric from the chart selector.
3. Compare the metric curve with posting cadence and follower movement.
4. If the dashboard says analytics are unavailable, treat that as a provider
   capability gap—not evidence that the account received zero engagement.

## 5. Analyze individual posts

1. Open **Post table**.
2. Filter by source type, such as slideshow, generated video, X automation, or
   external.
3. Sort by views, interactions, likes, comments, shares, saves, or engagement
   rate.
4. Select a row to open the post detail panel.
5. Use **Open live post** when a release URL is available.
6. Select **Export CSV** when deeper analysis is needed outside the app.

## 6. Turn metrics into content changes

For the astrology example, compare posts by repeatable creative decisions:

| Signal                        | Question                                                                        | Possible action                                               |
| ----------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| High views, weak saves        | Did the hook attract attention without teaching anything reusable?              | Strengthen the explanatory slides or closing takeaway.        |
| Strong saves, low reach       | Is the topic valuable but the first frame too generic?                          | Rewrite the hook and test a more specific promise.            |
| Strong comments               | Which claim, identity, or question caused conversation?                         | Add related hooks without copying the post verbatim.          |
| One account consistently wins | Is format, audience size, cadence, or platform behavior driving the difference? | Compare like-for-like posts before changing every automation. |
| Repeated underperformance     | Do the same hook style, media collection, or topic recur?                       | Pause that variant and replace one variable at a time.        |

Record the decision in the relevant automation: hook set, collection, content
direction, schedule, or destination. Do not edit several variables at once if
you want the next result to be interpretable.

## Success check

- The selected date range and account scope are explicit.
- At least one fresh snapshot was stored.
- Unsupported metrics are not interpreted as zero.
- Top and weak posts are traced back to source type and account.
- The analysis ends with a concrete, limited automation change.
