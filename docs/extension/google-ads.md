# Google Ads

URL match: `https://ads.google.com/*`

Detected platform: usually `unknown`

Extension files:

- `extension/manifest.json`
- `extension/content.js`
- `extension/background.js`
- `extension/content.css`

## What Happens On The Website

The manifest allows the content script to run on `ads.google.com`, but `content.js` only detects Google as `google` when:

- The host is `adstransparency.google.com`, or
- The path contains `transparency`.

For most `ads.google.com` pages, `platform()` returns `unknown`. The extension then runs the generic card scanner and injects card-level `Swipe` buttons into matching elements.

If an `ads.google.com` path includes `transparency`, the extension treats it as `google` and injects the single fixed Google button instead.

## Swipe Button Behavior

For normal `ads.google.com` pages:

- Buttons use `cfarm-swipe-card-button`.
- Buttons are appended to generic card/article matches.
- Payloads are saved with platform/source `unknown`.

For paths containing `transparency`:

- A fixed bottom-center button is injected.
- Payloads are saved as platform/source `google`.

## Data Collected

Normal `ads.google.com` pages use the generic payload builder:

| Field | How it is inferred |
| --- | --- |
| `advertiser` | Heading/strong/link text, document title, or `unknown`. |
| `platform` | Usually `unknown`. |
| `source` | Usually `unknown`. |
| `sourceUrl` | Current page URL. |
| `title` | Heading, caption excerpt, or document title. |
| `caption` | Text from the selected container. |
| `format` | Based on video/image presence. |
| `cta` | `Shop now`, `Learn more`, or `Inspect Swipe`. |
| `mediaUrl` | Video URL/poster or largest image/background image. |
| `metadata.Source` | Usually `unknown`. |
| `metadata.URL` | Current page URL. |

## Save Flow

The background worker captures the visible tab screenshot and posts the payload to:

```txt
http://localhost:3000/api/swipes
```

## Hardcoded / Fragile Parts

- `ads.google.com` is allowed by the manifest but is not explicitly mapped in `platform()` unless the path contains `transparency`.
- Most saved records from normal `ads.google.com` pages will be marked `unknown`.
- Generic card detection may attach to non-ad UI cards inside Google Ads.
- Google-specific text parsing only applies when platform is detected as `google`.
- The extension needs the local app running on port `3000`.
