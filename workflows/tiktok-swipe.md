# TikTok Swipe Workflow

## Goal

Verify TikTok profile/search grids show a swipe button under every video or carousel tile, and clicking a tile button creates a normalized TikTok swipe.

## Test Page

Open a TikTok page with a grid of posts, such as:

- `https://www.tiktok.com/@<username>`
- `https://www.tiktok.com/search/video?q=<keyword>`

Use a page that includes multiple videos and, when possible, at least one photo carousel.

## Steps

1. Wait until the grid is fully rendered.
2. Confirm every visible video or carousel tile has a `✣ Swipe` button under the tile.
3. Scroll down until more posts lazy-load.
4. Confirm newly loaded video or carousel tiles also receive their own `✣ Swipe` button.
5. Click `✣ Swipe` under at least three different tiles.
6. Include one `/video/` item and one `/photo/` item if both are available.
7. Confirm each button enters a saving state and then reports success.
8. Open the app Swipes view or `data/swipes/swipes.json` and confirm one new record per click.

## Expected Swipe Record

Each saved record should have:

- `platform` or `source`: `tiktok`
- `sourceUrl`: the item-specific TikTok post URL, not only the profile or search URL
- `landingPageUrl`: the same item-specific TikTok post URL when no external landing URL exists
- `advertiser`: username or creator handle when visible
- `caption`: post caption or accessible tile text when visible
- `format`: `video` for `/video/` URLs and `carousel` for `/photo/` URLs
- `stats.Views` when the view count is visible on the tile
- `media` or screenshot fields populated when capture succeeds

## Page-Level Fallback Check

If testing a TikTok page without a grid, confirm the fixed page-level `✣ Swipe` button appears and can save the current page. This does not replace the grid requirement on profile or search pages.

## Pass Criteria

The workflow passes when every visible and lazy-loaded grid video or carousel has a button under it, and each clicked item saves a TikTok record with an item-specific URL.
