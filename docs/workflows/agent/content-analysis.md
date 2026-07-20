---
title: "Analyze content performance [AI Agent via MCP]"
description: "Callable read-only agent workflow for comparing stored metrics, accounts, posts, and automation sources."
---

> **Implemented focused subset.** `lumenclip_analytics_report` reads stored,
> owner-scoped snapshots and returns a structured report. It does not refresh
> providers or create a persistent MCP report resource; an agent must not query
> Appwrite or PostFast directly.

## Outcome

The agent compares attributed post performance over a defined period, explains
what is observed versus unavailable, and recommends one controlled content
change without modifying an automation.

## Before you start

- At least one account must have stored analytics snapshots.
- Define a lookback in days and a comparison question.

## 1. Define the analysis

1. Resolve safe account metadata with `lumenclip_accounts_list`.
2. Restate the lookback, account IDs, and comparison question.
3. Explain that the report reflects stored snapshots rather than a live
   provider refresh.

## 2. Request the report

1. Call `lumenclip_analytics_report` with `days` (`1..365`), optional
   `integrationIds`, and `postLimit` (`1..200`).
2. Use the structured `generatedAt`, `since`, `totals`, `accounts`, and `posts`
   fields. Missing metrics remain absent rather than becoming synthetic zeroes.
3. Treat an empty account/post result as missing stored data, not proof of zero
   performance.

## 3. Compare performance

1. Compare like-for-like cohorts by platform, account, format, source type,
   hook family, topic, and time window.
2. Identify patterns with sample size and uncertainty. Do not claim causation
   from one winning post.
3. Recommend one limited automation change and explain which future metric
   would validate it.
4. Return the exact lookback/account filters used; no persistent report URI is
   created by the focused implementation.

## Success check

- Only read scope was used.
- Missing metrics remain unavailable rather than becoming zeroes.
- Conclusions state sample size and uncertainty.
- The agent recommends a change but does not apply it without a new approval.
