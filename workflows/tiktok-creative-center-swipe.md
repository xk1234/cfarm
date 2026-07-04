# TikTok Creative Center Swipe Workflow

## Goal

Verify TikTok Creative Center Top Ads and trends video cards expose swipe buttons and save normalized swipe records with Creative Center metadata.

## Test Page

Open:

- `https://ads.tiktok.com/business/creativecenter/` and navigate to a Top Ads listing.
- `https://ads.tiktok.com/creative/creativeCenter/trends/video?locale=en&deviceType=pc&region=US&period=7`.

## Steps

1. Wait until the ad grid or list is fully rendered.
2. Confirm every visible Top Ads card has a `✣ Swipe` button.
3. Scroll until additional cards lazy-load.
4. Confirm newly loaded cards also receive their own `✣ Swipe` button.
5. Click `✣ Swipe` on at least three different cards.
6. Include cards with visible performance labels or analytics links when available.
7. Confirm each button enters a saving state and then reports success.
8. Open the app Swipes view or `data/swipes/swipes.json` and confirm one new record per click.
9. Confirm the record appears immediately with `processing...` when transcription/analysis is still running.
10. Confirm processing later updates to `complete` or `failed` on the same record.
11. Open Inspect Swipe and confirm it renders as a page, not a modal.
12. Confirm the captured mp4 plays with native video controls.
13. If a destination URL was captured, confirm mobile and desktop landing-page screenshot buttons reveal saved screenshots.
14. On the trends video page, confirm each visible video card has a `✣ Swipe` button immediately under the video/thumbnail block.
15. Click `✣ Swipe` on at least three trends video cards and confirm each creates a `tiktok-creative` swipe with creator, caption, follower count, and video views when visible.

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
- for trends video cards, visible creator, thumbnail caption, follower count, and video views
- `processingStatus`: `processing`, `complete`, or `failed`
- `landingPageMobileScreenshotPath` / `landingPageDesktopScreenshotPath` when destination capture succeeds

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
