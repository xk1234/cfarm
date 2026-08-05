chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message?.type !== "DISCOVER_TIKTOK_STUDIO_POSTS") return false
  void discoverStudioPosts()
    .then((posts) => respond({ ok: true, posts }))
    .catch((error) =>
      respond({
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "TikTok posts were not found",
      })
    )
  return true
})

async function discoverStudioPosts() {
  const helpers = globalThis.LumenClipStudioDiscovery
  if (!helpers) throw new Error("Reload the LumenClip companion and try again")
  const posts = new Map()
  helpers.collectPosts(document, posts)
  const scroller = helpers.findPostScroller(document)
  const initialScrollTop = scroller.scrollTop
  let unchangedPasses = 0

  try {
    for (let pass = 0; pass < 300 && posts.size < 1_000; pass += 1) {
      const before = posts.size
      const maxScrollTop = Math.max(
        0,
        scroller.scrollHeight - scroller.clientHeight
      )
      const nextScrollTop = Math.min(
        maxScrollTop,
        scroller.scrollTop + Math.max(280, scroller.clientHeight * 0.8)
      )
      scroller.scrollTop = nextScrollTop
      scroller.dispatchEvent(new Event("scroll", { bubbles: true }))
      await wait(250)
      helpers.collectPosts(document, posts)
      unchangedPasses = posts.size === before ? unchangedPasses + 1 : 0
      const atBottom = nextScrollTop >= maxScrollTop - 2
      if (atBottom && unchangedPasses >= 3) break
    }
  } finally {
    scroller.scrollTop = initialScrollTop
    scroller.dispatchEvent(new Event("scroll", { bubbles: true }))
  }

  if (!posts.size) {
    throw new Error(
      "No posts were found in TikTok Studio Content. Open Posts and try again."
    )
  }
  return [...posts.values()]
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}
