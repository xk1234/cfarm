# Facebook Ads Library Swipe Workflow

## Goal

Verify Meta/Facebook Ads Library results each expose a swipe button directly under `See ad details`, and clicking it creates a normalized swipe record.

## Test Page

Open `https://www.facebook.com/ads/library/`, choose a country and ad category, then search for an active advertiser or keyword that returns multiple ads.

## Install Or Reload Extension

Use these steps before running this workflow if `CFarm Swipe Saver` is not already enabled in the browser:

1. Open Chrome to `chrome://extensions/`.
2. Turn on Developer mode.
3. Click `Load unpacked`.
4. Select `/Users/yexinkang/Desktop/cfarm/extension`.
5. Confirm `CFarm Swipe Saver` appears in the extension list and is enabled.
6. If the extension was already installed, click its reload button after any local changes.
7. Open or reload the Facebook Ads Library tab after installation so the content script injects.

## Steps

1. Wait until ad cards are fully rendered.
2. For at least five visible ads, confirm a `✣ Swipe` button appears directly under that ad card's `See ad details` control.
3. Scroll down until new results lazy-load.
4. Confirm newly loaded ads also receive their own `✣ Swipe` button under `See ad details`.
5. Click `✣ Swipe` on:
   - one image ad,
   - one video ad,
   - one carousel or multi-creative ad if available.
6. After each click, confirm the button enters a saving state and then reports success.
7. Open the app Swipes view or `data/swipes/swipes.json` and confirm one new record per click.
8. If the swipe is a video, confirm the card can appear with `processing...` and later updates to `complete` or `failed`.
9. Open Inspect Swipe and confirm it renders as a page, not a modal.
10. Confirm Facebook metadata and stats are readable structured fields, not a single wall of concatenated text.
11. If a destination URL was captured, confirm mobile and desktop landing-page screenshot buttons reveal saved screenshots.

## Expected Swipe Record

Each saved record should have:

- `platform` or `source`: `facebook`
- `sourceUrl`: the current Facebook Ads Library URL
- `advertiser`: advertiser/page name when visible
- `caption`: ad body or headline text when visible
- `format`: inferred from the visible creative, such as `image`, `video`, or `carousel`
- `media` or screenshot fields populated when capture succeeds
- `stats.Started` or similar Meta ad metadata when visible on the card
- `processingStatus`: `processing`, `complete`, or `failed`
- `landingPageMobileScreenshotPath` / `landingPageDesktopScreenshotPath` when destination capture succeeds

## Pass Criteria

The workflow passes when every visible ad card with `See ad details` has its own button directly beneath it, lazy-loaded cards are handled, every clicked button creates a Facebook swipe record, Inspect Swipe is page-based, and Facebook data is displayed as structured fields.

## Failure Notes

Treat any card without a button under `See ad details` as a failure, even if a generic floating button exists elsewhere on the page.
