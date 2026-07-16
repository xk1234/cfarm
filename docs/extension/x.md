# X / Twitter

URL match: `https://x.com/*`, `https://twitter.com/*`

Detected platform: `twitter`

Extension files:

- `extension/manifest.json`
- `extension/platform-adapters.js` (adapter id `twitter`, `adapter: "xTwitter"`)
- `extension/content.js`
- `extension/background.js`

## What Happens On The Website

The extension injects "Swipe" buttons onto individual tweets/posts. Cards are detected with (`platform-adapters.js`):

- `article[data-testid='tweet']`
- `article[role='article']`
- `article[data-tweet-id]`

`buttonMode` is `card`, so a swipe button is attached per matched post card.

## Swipe Button Behavior

Clicking a card's button posts a message to the background service worker with a payload built from the selected tweet `article`.

## Data Collected

The `xTwitter` payload builder derives the standard swipe fields from the tweet card: `advertiser` (author), `platform`/`source` = `twitter`, `sourceUrl` (page URL), `title`/`caption` (tweet text), `format` (video vs image/carousel), and `mediaUrl` (largest media/poster). Verify exact field mapping in `extension/content.js` before relying on any single field.

## Save Flow

The background worker captures a PNG screenshot of the visible tab and posts it with the swipe payload to:

```txt
http://localhost:3000/api/swipes
```

## Hardcoded / Fragile Parts

- Card detection depends on X's `data-testid`/`role` attributes, which X changes periodically.
- The extension needs the local app running on port `3000`.
