# LumenClip companion

This Chrome MV3 extension connects a logged-in TikTok session to LumenClip. It
imports TikTok Studio analytics and owns the TikTok comment workflow: capture,
draft review, editing, approval, optional hearts, and sending.

## Comment review

Start **Collect in extension** from a TikTok post in LumenClip Analytics. The
signed collection is handed to the extension and capture starts immediately.
Open the extension in **Comments** mode to see every captured comment beside
its drafted response.

- Edit or approve one response at a time.
- **Approve all** requires another confirmation when careful/flagged replies
  are included.
- Only approved drafts can be queued for sending.
- The extension posts queued replies through the logged-in TikTok tab and
  shows queued, sent, or failed state per response.

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
