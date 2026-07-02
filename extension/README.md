# CFarm Swipe Saver Extension

This unpacked Chrome extension injects `Swipe` buttons into supported ad pages and saves captured swipe data to the local app.

## Supported pages

- Facebook Ads Library
- TikTok Creative Center top ads
- TikTok
- Google Ads Transparency Center

## Local setup

1. Start the app with `npm run dev`.
2. Open Chrome `chrome://extensions`.
3. Enable Developer mode.
4. Click Load unpacked.
5. Select `/Users/yexinkang/Desktop/cfarm/extension`.
6. Visit a supported ad page and click `Swipe`.

Saved records are written to `/Users/yexinkang/Desktop/cfarm/data/swipes/swipes.json`.
Captured screenshots are written to `/Users/yexinkang/Desktop/cfarm/data/swipes/assets`.
