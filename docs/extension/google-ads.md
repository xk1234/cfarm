# Google Ads

URL match: `https://ads.google.com/*`

Detected platform: `google-ads`

Extension files:

- `extension/manifest.json`
- `extension/content.js`
- `extension/background.js`
- `extension/content.css`

## What Happens On The Website

For `ads.google.com` pages, the extension now uses an explicit `google-ads` adapter with `buttonMode: none`. Chrome currently redirects the public URL to Google's Google Ads marketing site, which has offer/marketing cards but no swipeable ad-library creative surface.

## Swipe Button Behavior

No `Swipe` buttons are injected on `ads.google.com` marketing pages.

## Data Collected

No swipe payload is built because there is no button injection on this host.

## Save Flow

The background worker captures the visible tab screenshot and posts the payload to:

```txt
http://localhost:3000/api/swipes
```

## Hardcoded / Fragile Parts

- `ads.google.com` remains in the manifest but is explicitly mapped to no injection.
- The public page currently redirects to Google Ads marketing content, so marketing offer cards are intentionally ignored.
- The extension needs the local app running on port `3000`.
