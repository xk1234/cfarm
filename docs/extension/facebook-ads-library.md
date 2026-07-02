# Facebook Ads Library

URL match: `https://www.facebook.com/ads/library/*`

Detected platform: `facebook`

Extension files:

- `extension/manifest.json`
- `extension/content.js`
- `extension/background.js`
- `extension/content.css`

## What Happens On The Website

When a Facebook Ads Library page finishes loading, `content.js` runs at `document_idle`. It scans the page for likely ad cards and injects a `Swipe` button into each matching card.

The generic card matcher looks for elements like:

- `[role='article']`
- `[data-testid*='ad']`
- `[class*='ad-card']`
- `[class*='AdCard']`
- `[class*='card']`
- `article`

It skips anything inside headers, navs, or fixed header containers. It also ignores candidates that do not have enough text or media.

## Swipe Button Behavior

The injected button:

- Uses the CSS class `cfarm-swipe-card-button`.
- Is positioned at the top-right of the detected ad card.
- Starts with the label `✣ Swipe`.
- Changes to `Saving...`, `✓ Swiped`, `Server offline`, `Save failed`, or `Extension error` based on the save result.

Clicking the button stops the site click event and sends a `CFARM_SAVE_SWIPE` message to the background service worker.

## Data Collected

For Facebook, the extension uses the generic payload builder.

It tries to infer:

| Field | How it is inferred |
| --- | --- |
| `advertiser` | First useful heading/strong/link text inside the card. |
| `platform` | `facebook`. |
| `source` | `facebook`. |
| `sourceUrl` | Current page URL. |
| `title` | First useful heading, falling back to caption or document title. |
| `caption` | Trimmed text from the card. |
| `format` | `video`, `carousel`, `image`, or `unknown` based on media nodes. |
| `cta` | `Shop now`, `Learn more`, or `Inspect Swipe` based on caption text. |
| `mediaUrl` | First video URL/poster or the largest image/background image found. |
| `metadata.Source` | `facebook`. |
| `metadata.URL` | Current page URL. |
| `stats.Started` | Parsed from text like `Started running on ...`, when found. |

## Save Flow

The background worker captures the visible tab as a PNG screenshot and posts the payload plus `screenshotDataUrl` to:

```txt
http://localhost:3000/api/swipes
```

The local app then writes records through `lib/swipes.ts`.

## Hardcoded / Fragile Parts

- Card detection is heuristic and depends on Facebook's current DOM.
- The extension does not use a Facebook-specific parser beyond platform detection.
- CTA detection only checks for `shop now` and `learn more`.
- Landing page URLs are not extracted for Facebook; `landingPageUrl` is sent as an empty string.
- The extension needs the local app running on port `3000`.
