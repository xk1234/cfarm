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
        "Import every post from TikTok Studio, including posts that are not in LumenClip yet, then capture their private analytics.",
      identity: "Content and analytics",
      connectLabel: "Import all posts",
      steps: [
        "Choose the matching TikTok account in LumenClip.",
        "The companion discovers every post in TikTok Studio Content.",
        "Missing publications are created before analytics capture starts.",
        "Private Studio reports are captured and saved automatically.",
      ],
    }
  }

  const post = url.pathname.match(/^\/@([^/]+)\/(?:video|photo)\/(\d+)\/?$/)
  if (post) {
    return {
      kind: "post",
      feature: "comments",
      label: "TikTok post",
      title: "Draft comment replies",
      description:
        "Capture comments from this post, then review, edit, approve, and send drafted replies here.",
      identity: `@${decodeURIComponent(post[1])} · Post ${post[2]}`,
      handle: decodeURIComponent(post[1]),
      platformPostId: post[2],
      connectLabel: "Load comments",
      steps: [
        "The extension matches the open TikTok to its published post.",
        "It opens the comment panel and captures the visible comments.",
        "Review, edit, approve, and send drafted replies here.",
      ],
    }
  }

  return unsupportedContext()
}

export function companionConnectUrl(appOrigin) {
  const url = new URL("/app/analytics", appOrigin)
  url.searchParams.set("companion", "tiktok-studio")
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
