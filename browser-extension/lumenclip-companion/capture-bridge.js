window.addEventListener("__lumenclipTikTokStudioAnalytics", (event) => {
  const detail = event.detail
  if (!detail || typeof detail !== "object") return
  chrome.runtime.sendMessage({
    type: "TIKTOK_STUDIO_ANALYTICS_CAPTURE",
    studioUrl: detail.studioUrl,
    payload: detail.payload,
  })
})
