# LumenClip companion

This Chrome MV3 extension connects a logged-in TikTok session to LumenClip. It imports TikTok Studio analytics, collects top-level comments, and posts only replies that the LumenClip server has explicitly approved.

## Load unpacked

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Choose **Load unpacked** and select `browser-extension`.
4. Open the extension popup and connect each feature from its LumenClip page.

## Content scripts

- `capture-main.js` observes TikTok Studio analytics `fetch` and XHR responses on the existing `tiktokstudio/analytics/*` pages.
- `capture-bridge.js` relays those captured responses to the extension service worker.
- `tiktok.js` runs only on matching TikTok post pages after the worker requests a comments collection or an approved reply.
- `lumenclip-bridge.js` accepts Studio and Comments connection messages only on the configured LumenClip app origins.
