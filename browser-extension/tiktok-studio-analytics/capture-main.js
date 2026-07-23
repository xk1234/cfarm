(() => {
  const EVENT_NAME = "__lumenclipTikTokStudioAnalytics"
  const INSIGHT_PATHS = [
    "/aweme/v2/data/insight/",
    "/tiktok/v1/analytics/insights/",
  ]

  function isInsightUrl(value) {
    try {
      const url = new URL(String(value), window.location.href)
      return (
        url.hostname === "www.tiktok.com" &&
        INSIGHT_PATHS.some((path) => url.pathname === path)
      )
    } catch {
      return false
    }
  }

  function emit(payload) {
    window.dispatchEvent(
      new CustomEvent(EVENT_NAME, {
        detail: {
          studioUrl: window.location.href,
          payload,
        },
      })
    )
  }

  const originalFetch = window.fetch
  window.fetch = async function lumenclipFetch(input, init) {
    const response = await originalFetch.call(this, input, init)
    const url = typeof input === "string" ? input : input?.url
    if (isInsightUrl(url)) {
      response
        .clone()
        .json()
        .then(emit)
        .catch(() => undefined)
    }
    return response
  }

  const originalOpen = XMLHttpRequest.prototype.open
  const originalSend = XMLHttpRequest.prototype.send
  XMLHttpRequest.prototype.open = function lumenclipOpen(
    method,
    url,
    ...rest
  ) {
    this.__lumenclipInsightUrl = isInsightUrl(url)
    return originalOpen.call(this, method, url, ...rest)
  }
  XMLHttpRequest.prototype.send = function lumenclipSend(...args) {
    if (this.__lumenclipInsightUrl) {
      this.addEventListener(
        "load",
        () => {
          try {
            emit(JSON.parse(this.responseText))
          } catch {
            // TikTok can return an empty response while a tab is switching.
          }
        },
        { once: true }
      )
    }
    return originalSend.apply(this, args)
  }
})()
