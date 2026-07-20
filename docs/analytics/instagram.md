---
title: "Instagram analytics"
description: "Instagram views, impressions, reach, engagement signals, and account trends in LumenClip."
---

Instagram has full post-level support. It exposes the broadest seeded set in LumenClip: Views, Impressions, Reach, Likes, Comments, Shares, Saves, and Interactions.

![Instagram platform comparison with three selected accounts, Impressions chart, account breakdown, and recent posts](./images/instagram.png)

## Multi-account view

The Instagram drill-down lets users multi-select connected Instagram accounts
and compare Views, Impressions, Reach, Likes, Comments, Shares, Saves, or
Interactions over time. Engagement rate appears when derivable, and Followers
appears when follower history exists. Account selectors use profile pictures
with a small Instagram icon overlapping the bottom-left. See
[Platform comparison](./platform-comparison.md) for the full interaction and
visualization contract.

## Available metrics

| Metric          | In metric picker                       | What it answers                                                         |
| --------------- | -------------------------------------- | ----------------------------------------------------------------------- |
| Views           | Yes                                    | How many view events did the content receive?                           |
| Impressions     | Yes                                    | How many total displays were recorded, including repeated exposure?     |
| Reach           | Yes                                    | How many distinct accounts were exposed, when supplied by the provider? |
| Likes           | Yes                                    | How many lightweight positive reactions occurred?                       |
| Comments        | Yes                                    | How much direct conversation did the post create?                       |
| Shares          | Yes                                    | How often did viewers redistribute it?                                  |
| Saves           | Yes                                    | How often did viewers keep it for later?                                |
| Interactions    | Yes                                    | Provider total or likes + comments + shares + saves.                    |
| Engagement rate | Derived and visible in post comparison | How large were interactions relative to views, impressions, or reach?   |

If PostFast supplies impressions but not views, the normalizer preserves impressions and copies the same value into canonical Views. This makes the cross-platform Views KPI usable, but the two values should not be interpreted as independently measured numbers in that case.

## Recommended reading order

1. Compare Reach with Impressions. A widening gap can indicate repeat exposure.
2. Use Views for video/reel volume, but verify the content format before comparing it with a static post.
3. Compare Saves and Shares for durable utility and social transmission.
4. Use Engagement rate to normalize for distribution size.
5. Use recent-post source labels and post detail to compare automated slideshows, video automations, manual posts, and external posts.

## Practical decisions

- Strong reach + weak saves/shares: improve specificity, utility, or the call to action.
- Impressions materially above reach: the post is being seen repeatedly; inspect whether interactions also increase.
- Strong saves + modest likes: the content may be useful without being socially expressive—do not discard it.
- Strong reel views + weak follower growth: test clearer niche positioning and profile-to-post continuity.

## Caveats

- Instagram formats are not separated into distinct analytics schemas in this dashboard. Reels, timeline posts, and other returned content share the same canonical table.
- Reach and impressions depend on the provider/account returning those fields; missing values remain missing.
- The stored curve is produced by repeated LumenClip syncs, not by a native per-day Instagram series.
- Engagement rate uses the first non-zero denominator in this order: views, impressions, reach.

[Back to the analytics overview](./overall.md)
