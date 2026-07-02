# Local CFarm App

URL / API target: `http://localhost:3000/api/swipes`

Content script injection: none

Extension files:

- `extension/manifest.json`
- `extension/background.js`
- `app/api/swipes/route.ts`
- `lib/swipes.ts`

## What Happens Locally

The extension does not inject UI into the local app. It posts saved swipe payloads to the local Next.js API endpoint.

The manifest includes host permission for:

```txt
http://localhost:3000/*
```

The content script uses:

```txt
http://localhost:3000/api/swipes
```

as the default save endpoint.

## Save Flow

When a user clicks `Swipe` on a supported external site:

1. `content.js` builds a swipe payload from the selected page/container.
2. `content.js` sends `CFARM_SAVE_SWIPE` to `background.js`.
3. `background.js` captures the visible tab as PNG using `chrome.tabs.captureVisibleTab`.
4. For TikTok Creative Center Top Ads detail URLs, `background.js` may open an inactive tab to enrich analytics.
5. `background.js` posts the payload and `screenshotDataUrl` to `/api/swipes`.
6. The app writes the swipe record to `data/swipes/swipes.json`.
7. The app writes screenshots/media under `data/swipes/assets`.

## Local Objects Involved

| Object | Source | Usage |
| --- | --- | --- |
| `SwipePayload` | `lib/swipes.ts` | API request body accepted by `createSwipe()`. |
| `SwipeRecord` | `lib/swipes.ts` | Persisted swipe object. |
| `screenshotDataUrl` | `background.js` | Visible tab capture saved as a local asset. |
| `analyticsText` | `background.js` | Optional raw analytics detail text for TikTok Creative Center. |

## Hardcoded / Fragile Parts

- The API URL is hardcoded to `http://localhost:3000/api/swipes` in `content.js`.
- If the local dev server is not running, the button shows a failure state.
- The extension assumes the app API can write to local `data/swipes`.
- This is a local development workflow, not a deployed production extension endpoint.
