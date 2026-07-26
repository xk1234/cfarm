window.addEventListener("message", (event) => {
  if (
    event.source !== window ||
    event.origin !== window.location.origin ||
    event.data?.source !== "lumenclip-web" ||
    event.data?.type !== "LUMENCLIP_TIKTOK_COMMENTS_CONNECT"
  ) return
  const { requestId, config } = event.data
  let endpoint
  try { endpoint = new URL(config?.endpoint) } catch {
    respond(requestId, false, "Invalid LumenClip endpoint")
    return
  }
  if (endpoint.origin !== window.location.origin || config?.version !== 1 || typeof config?.token !== "string") {
    respond(requestId, false, "Invalid companion connection")
    return
  }
  chrome.runtime.sendMessage({ type: "SET_CONFIG", config }, (result) => {
    respond(requestId, Boolean(result?.ok), result?.error)
  })
})
function respond(requestId, ok, error) {
  window.postMessage({
    source: "lumenclip-companion",
    type: "LUMENCLIP_TIKTOK_COMMENTS_CONNECT_RESULT",
    requestId, ok, error,
  }, window.location.origin)
}
