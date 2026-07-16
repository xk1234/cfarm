# Tumblr

URL match: `https://www.tumblr.com/*`, `https://*.tumblr.com/*` (plus media hosts `https://media.tumblr.com/*`, `https://*.media.tumblr.com/*`)

Detected platform: `tumblr`

Extension files:

- `extension/manifest.json`
- `extension/platform-adapters.js` (adapter id `tumblr`, `candidateMode: "backgroundCapture"`)
- `extension/content.js`
- `extension/background.js`

## What Happens On The Website

Tumblr uses **background image capture**, not per-card swipe buttons (`buttonMode: "none"`). The background service worker registers a `webRequest` listener on `*://*.media.tumblr.com/*` and records observed image requests (`recordTumblrImageRequest`), bounded by `CFARM_TUMBLR_IMAGE_LIMIT`. Posts are matched against `article` / `[data-id]` card selectors for context.

This lets the extension collect image media as the user browses Tumblr, rather than requiring a click per post.

## Data Collected

- Image URLs intercepted from `media.tumblr.com` requests (capped by `CFARM_TUMBLR_IMAGE_LIMIT`).
- Standard swipe context fields (`platform`/`source` = `tumblr`, `sourceUrl`, and page/card-derived `title`/`caption`) when a swipe is saved.

## Save Flow

Captured swipes post to:

```txt
http://localhost:3000/api/swipes
```

## Hardcoded / Fragile Parts

- Requires the `webRequest` permission and the `*.media.tumblr.com` host permissions declared in `manifest.json`.
- The captured-image count is capped (`CFARM_TUMBLR_IMAGE_LIMIT`).
- The extension needs the local app running on port `3000`.
