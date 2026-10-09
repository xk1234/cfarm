---
title: "Public generated video"
description: "Signed public viewer and direct download for ready generated videos."
---

# Public generated video

Ready generated videos can be opened without signing in at
`/share/videos/{outputId}?token={signedToken}`. The page includes the video
player, generated description and hashtags, and a download action.

The token is signed server-side and binds both the workspace owner and output
ID. The public page resolves the output inside that owner context and serves
only records whose generation status is `ready` and which have a stored video.
Invalid, expired, or mismatched tokens return the not-found page.

The player and download action use
`/api/public/videos/{outputId}/media?kind=video&token={signedToken}`. The media
route supports HTTP byte ranges for seeking. `kind=thumbnail` serves the poster
image, and `download=1` adds an attachment response header.

MCP returns `publicViewUrl` and `downloadUrl` for completed AI UGC generations
and ready generated-video outputs. Configure `BASE_URL` to make these absolute.
Signing uses `OUTPUT_SHARE_SECRET`, falling back to
`SLIDESHOW_SHARE_SECRET`, then `RAILWAY_API_KEY`.
