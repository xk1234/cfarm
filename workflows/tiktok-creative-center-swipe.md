# TikTok Creative Center Swipe Workflow

## Goal

Verify TikTok Creative Center Top Ads cards expose swipe buttons and save normalized swipe records with Creative Center metadata.

## Test Page

Open `https://ads.tiktok.com/business/creativecenter/` and navigate to a Top Ads listing or another Creative Center listing that renders multiple ad cards.

## Steps

1. Wait until the ad grid or list is fully rendered.
2. Confirm every visible Top Ads card has a `✣ Swipe` button.
3. Scroll until additional cards lazy-load.
4. Confirm newly loaded cards also receive their own `✣ Swipe` button.
5. Click `✣ Swipe` on at least three different cards.
6. Include cards with visible performance labels or analytics links when available.
7. Confirm each button enters a saving state and then reports success.
8. Open the app Swipes view or `data/swipes/swipes.json` and confirm one new record per click.

## Expected Swipe Record

Each saved record should have:

- `platform` or `source`: `tiktok-creative`
- `advertiser`: `TikTok Top Ads` unless a more specific advertiser is extracted
- `format`: `video`
- `cta`: `See analytics`
- `sourceUrl`: the item analytics/detail URL when available, otherwise the current listing URL
- `landingPageUrl`: the same analytics/detail URL when available
- `caption`: the card title, headline, or visible ad text
- `metadata.Region`, `metadata.Period`, `metadata.Objective`, or `metadata.Industry` when visible
- visible card stats such as likes, comments, shares, CTR, CVR, or impressions when present

## Detail Enrichment Check

For a card with a detail or analytics URL, open the saved swipe and confirm enriched fields are present when the detail page is accessible:

- `source_video_url`
- likes, comments, shares, or play count
- publish time or duration
- ranking, budget level, or benchmark fields

## Pass Criteria

The workflow passes when every visible and lazy-loaded Creative Center ad card has a button and each clicked card saves as `tiktok-creative` with the best available card or detail URL.

## Teardown

If `CFarm Swipe Saver` was installed only for this QA run, remove it from `chrome://extensions/` after the workflow is complete. Stop the local dev server if it was started only for this workflow, and close any Creative Center detail tabs opened during testing.
