# Google Ads Transparency Center

URL match: `https://adstransparency.google.com/*`

Detected platform: `google`

Extension files:

- `extension/manifest.json`
- `extension/content.js`
- `extension/background.js`
- `extension/content.css`

## What Happens On The Website

On Google's Ads Transparency Center, the extension injects `Swipe` buttons only into ad result tiles. The live ad grid uses `creative-preview` elements with child creative links shaped like:

```txt
a[href*="/advertiser/"][href*="/creative/"][aria-label^="Advertisement"]
```

The home/search page's informational cards are not swipe candidates.

## Swipe Button Behavior

The button:

- Uses CSS class `cfarm-swipe-card-button`.
- Is appended to each detected `creative-preview` tile.
- Saves that creative tile, not the full page body.

Clicking it sends a Google Transparency creative payload to the background worker.

## Data Collected

Google Transparency uses a creative-tile payload builder.

| Field | How it is inferred |
| --- | --- |
| `advertiser` | Heading/strong/link text, or regex from body text like `advertiser ... report this ad`. |
| `platform` | `google`. |
| `source` | `google`. |
| `sourceUrl` | Google Transparency creative URL. |
| `title` | Advertiser text or `Google ad`. |
| `caption` | Text from the selected creative tile. |
| `format` | Based on video/image presence. |
| `cta` | `Shop now`, `Learn more`, or `Inspect Swipe`. |
| `mediaUrl` | Best video URL/poster or largest image/background image. |
| `metadata.Source` | `google`. |
| `metadata.URL` | Current page URL. |

## Save Flow

The background worker captures the visible tab screenshot and posts the payload to:

```txt
http://localhost:3000/api/swipes
```

## Hardcoded / Fragile Parts

- Buttons are shown only on `creative-preview` ad tiles.
- The advertiser parser is regex/text based.
- Landing page URL is the Google Transparency creative URL, not the advertiser's destination URL.
- The extension needs the local app running on port `3000`.
