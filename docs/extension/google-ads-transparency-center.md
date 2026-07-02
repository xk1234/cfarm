# Google Ads Transparency Center

URL match: `https://adstransparency.google.com/*`

Detected platform: `google`

Extension files:

- `extension/manifest.json`
- `extension/content.js`
- `extension/background.js`
- `extension/content.css`

## What Happens On The Website

On Google's Ads Transparency Center, the extension injects a single fixed `Swipe` button into the page body.

Unlike most other supported pages, Google routes do not run the generic per-card injection after the fixed button. `injectButtons()` returns immediately after adding the Google fixed button.

## Swipe Button Behavior

The button:

- Uses CSS class `cfarm-swipe-fixed`.
- Appears bottom-center.
- Saves the full `document.body` context.

Clicking it sends the generic payload to the background worker.

## Data Collected

Google uses the generic payload builder with one extra advertiser heuristic.

| Field | How it is inferred |
| --- | --- |
| `advertiser` | Heading/strong/link text, or regex from body text like `advertiser ... report this ad`. |
| `platform` | `google`. |
| `source` | `google`. |
| `sourceUrl` | Current page URL. |
| `title` | Best heading, caption excerpt, or document title. |
| `caption` | Full body text trimmed to payload length. |
| `format` | Based on video/image presence. |
| `cta` | `Shop now`, `Learn more`, or `Inspect Swipe`. |
| `mediaUrl` | Best video URL/poster or largest image/background image. |
| `metadata.Format` | Parsed from text like `Format ...`, when present. |
| `stats.Last shown` | Parsed from text like `Last shown ...`, when present. |
| `metadata.Source` | `google`. |
| `metadata.URL` | Current page URL. |

## Save Flow

The background worker captures the visible tab screenshot and posts the payload to:

```txt
http://localhost:3000/api/swipes
```

## Hardcoded / Fragile Parts

- Only one fixed button is injected; there are no per-card buttons on Google Transparency pages.
- The advertiser parser is regex/text based.
- Saving uses the full body, so the payload can include navigation or surrounding page text.
- Landing page URL is not extracted.
- The extension needs the local app running on port `3000`.
