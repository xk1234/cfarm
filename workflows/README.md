# Swipe QA Workflows

These workflows verify that the browser extension can create a swipe from each supported platform surface.

## Shared Setup

1. Start the app locally at `http://localhost:3000`.
2. Load or reload the unpacked browser extension from `extension/`.
3. Open DevTools on the tested page and keep the Console visible.
4. Before each run, note the current count in the app Swipes view or inspect `data/swipes/swipes.json`.
5. After each swipe, verify that a new record is created and that the extension UI reports success.

## Shared Teardown

1. If `CFarm Swipe Saver` was installed only for QA, remove it from `chrome://extensions/` after the workflow run is complete.
2. Stop any local dev server that was started only for the workflow.
3. Close extra platform or landing-page tabs opened during the run.

## Platform Workflows

- [Facebook Ads Library](facebook-ads-library-swipe.md)
- [TikTok](tiktok-swipe.md)
- [TikTok Creative Center](tiktok-creative-center-swipe.md)
- [TikTok Seller SG](tiktok-seller-sg-swipe.md)
- [Google Ads Transparency Center](google-ads-transparency-center-swipe.md)
- [Google Ads](google-ads-swipe.md)

## Common Failure Signals

- No `✣ Swipe` button appears after page content has loaded.
- Button appears only on the first item when the page has multiple ads, videos, or carousel items.
- Clicking the button does not create a new swipe record.
- Created record has the wrong `platform` or `source`.
- Created record points to the listing page when an item-specific URL is available.
- Extension console shows selector, mutation observer, capture, or API request errors.
