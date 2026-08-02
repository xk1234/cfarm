;(function installStudioDiscoveryHelpers(root) {
  const POST_PATH = /^\/@([^/]+)\/(?:video|photo)\/(\d+)\/?$/
  const DATE_PATTERN =
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},(?:\s+\d{4},)?\s+\d{1,2}:\d{2}\s*(?:AM|PM)\b/i

  function collectPosts(documentRoot, existing = new Map()) {
    const anchors = documentRoot.querySelectorAll(
      'a[href*="/video/"], a[href*="/photo/"]'
    )
    for (const anchor of anchors) {
      const parsed = parsePostUrl(anchor.href)
      if (!parsed || existing.has(parsed.externalPostId)) continue
      const content = String(anchor.textContent || "").trim()
      const publishedLabel = findPublishedLabel(anchor, content)
      existing.set(parsed.externalPostId, {
        ...parsed,
        content: content || undefined,
        publishedAt: publishedLabel
          ? parseStudioDate(publishedLabel, new Date())
          : undefined,
      })
    }
    return existing
  }

  function parsePostUrl(value) {
    try {
      const url = new URL(value, "https://www.tiktok.com")
      if (url.hostname !== "www.tiktok.com") return null
      const match = url.pathname.match(POST_PATH)
      if (!match) return null
      return {
        externalPostId: match[2],
        releaseUrl: `https://www.tiktok.com/@${match[1]}/${url.pathname.includes("/photo/") ? "photo" : "video"}/${match[2]}`,
        accountHandle: decodeURIComponent(match[1]),
      }
    } catch {
      return null
    }
  }

  function findPublishedLabel(anchor, content) {
    let node = anchor.parentElement
    for (let depth = 0; node && depth < 10; depth += 1) {
      const text = String(node.textContent || "").trim()
      const withoutContent = content ? text.replace(content, "") : text
      const match = withoutContent.match(DATE_PATTERN)
      if (match) return match[0]
      node = node.parentElement
    }
    return ""
  }

  function parseStudioDate(label, now) {
    const normalized = String(label || "")
      .replace(/\s+/g, " ")
      .trim()
    if (!normalized) return undefined
    const includesYear = /,\s+\d{4},/.test(normalized)
    let timestamp = Date.parse(
      includesYear
        ? normalized
        : `${normalized.replace(",", `, ${now.getFullYear()},`)}`
    )
    if (!Number.isFinite(timestamp)) return undefined
    if (!includesYear && timestamp > now.getTime() + 24 * 60 * 60 * 1000) {
      timestamp = Date.parse(
        normalized.replace(",", `, ${now.getFullYear() - 1},`)
      )
    }
    return Number.isFinite(timestamp)
      ? new Date(timestamp).toISOString()
      : undefined
  }

  function findPostScroller(documentRoot) {
    const anchor = documentRoot.querySelector(
      'a[href*="/video/"], a[href*="/photo/"]'
    )
    let node = anchor?.parentElement
    while (node) {
      const style = getComputedStyle(node)
      if (
        ["auto", "scroll"].includes(style.overflowY) &&
        node.scrollHeight > node.clientHeight + 20
      ) {
        return node
      }
      node = node.parentElement
    }
    return documentRoot.scrollingElement || documentRoot.documentElement
  }

  root.LumenClipStudioDiscovery = {
    collectPosts,
    findPostScroller,
    parsePostUrl,
    parseStudioDate,
  }
})(globalThis)
