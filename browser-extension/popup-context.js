const TIKTOK_ORIGIN = "https://www.tiktok.com"

export function classifyTikTokContext(value) {
  let url
  try {
    url = new URL(value)
  } catch {
    return unsupportedContext()
  }
  if (url.origin !== TIKTOK_ORIGIN) return unsupportedContext()

  if (
    url.pathname === "/tiktokstudio/content" ||
    url.pathname.startsWith("/tiktokstudio/content/") ||
    url.pathname === "/tiktokstudio/analytics" ||
    url.pathname.startsWith("/tiktokstudio/analytics/")
  ) {
    return {
      kind: "studio",
      feature: "studio",
      label: "TikTok Studio",
      title: "Import TikTok analytics",
      description:
        "Choose what to import in LumenClip. The companion will open each private Studio report and save it automatically.",
      identity: "Content and analytics",
      connectLabel: "Continue in LumenClip",
      steps: [
        "Choose a TikTok account and sync scope in LumenClip.",
        "Keep Chrome open while the companion visits each report.",
        "Captured metrics are attached to the matching LumenClip posts.",
      ],
    }
  }

  const post = url.pathname.match(/^\/@([^/]+)\/(?:video|photo)\/(\d+)\/?$/)
  if (post) {
    return {
      kind: "post",
      feature: "comments",
      label: "TikTok post",
      title: "Collect post comments",
      description:
        "Connect this exact post to its LumenClip post, then capture comments and review drafted replies here.",
      identity: `@${decodeURIComponent(post[1])} · Post ${post[2]}`,
      handle: decodeURIComponent(post[1]),
      platformPostId: post[2],
      connectLabel: "Connect this post",
      steps: [
        "LumenClip matches this TikTok post to an imported post.",
        "The companion opens the comment panel and captures comments.",
        "Return here to edit, approve, and send drafted replies.",
      ],
    }
  }

  return unsupportedContext()
}

export function companionConnectUrl(appOrigin, context) {
  const url = new URL("/app/analytics", appOrigin)
  if (context.feature === "studio") {
    url.searchParams.set("companion", "tiktok-studio")
  } else if (context.feature === "comments" && context.platformPostId) {
    url.searchParams.set("companion", "tiktok-comments")
    url.searchParams.set("platformPostId", context.platformPostId)
  }
  return url.toString()
}

export function commentReviewMatchesPost(review, platformPostId) {
  if (!platformPostId || !Array.isArray(review?.collection?.posts)) return false
  return review.collection.posts.some(
    (post) =>
      String(post?.platformPostId || "") === platformPostId ||
      platformPostIdFromUrl(post?.url) === platformPostId
  )
}

function platformPostIdFromUrl(value) {
  try {
    return new URL(value).pathname.match(
      /^\/@[^/]+\/(?:video|photo)\/(\d+)\/?$/
    )?.[1]
  } catch {
    return undefined
  }
}

function unsupportedContext() {
  return {
    kind: "unsupported",
    feature: null,
    label: "LumenClip companion",
    title: "Open a supported TikTok page",
    description:
      "Use TikTok Studio Content to import analytics, or open an individual TikTok post to collect comments.",
    identity: "No supported page detected",
    connectLabel: "Open TikTok Studio",
    steps: [
      "Open TikTok Studio Content for analytics imports.",
      "Open a URL ending in /video/{id} or /photo/{id} for comment collection.",
    ],
  }
}
