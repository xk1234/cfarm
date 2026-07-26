window.addEventListener("message", (event) => {
  if (
    event.source !== window ||
    event.origin !== window.location.origin ||
    event.data?.source !== "lumenclip-web"
  ) {
    return
  }

  if (event.data?.type === "LUMENCLIP_TIKTOK_STUDIO_CONNECT") {
    connectStudio(event.data)
    return
  }
  if (event.data?.type === "LUMENCLIP_TIKTOK_COMMENTS_CONNECT") {
    connectComments(event.data)
  }
})

function connectStudio(data) {
  const requestId = data.requestId
  const config = data.config
  const endpoint = parseEndpoint(config?.endpoint)
  if (!endpoint) {
    respond(
      "LUMENCLIP_TIKTOK_STUDIO_CONNECT_RESULT",
      requestId,
      false,
      "Invalid LumenClip endpoint"
    )
    return
  }
  if (
    endpoint.origin !== window.location.origin ||
    config?.version !== 3 ||
    typeof config?.token !== "string"
  ) {
    respond(
      "LUMENCLIP_TIKTOK_STUDIO_CONNECT_RESULT",
      requestId,
      false,
      "Invalid companion connection"
    )
    return
  }

  chrome.runtime.sendMessage(
    {
      type: "SET_DEVICE_CONFIG",
      config,
      autoStart: data.autoStart === true,
    },
    (result) => {
      const error = chrome.runtime.lastError?.message || result?.error
      respond(
        "LUMENCLIP_TIKTOK_STUDIO_CONNECT_RESULT",
        requestId,
        Boolean(result?.ok),
        error
      )
    }
  )
}

function connectComments(data) {
  const requestId = data.requestId
  const config = data.config
  const endpoint = parseEndpoint(config?.endpoint)
  if (!endpoint) {
    respond(
      "LUMENCLIP_TIKTOK_COMMENTS_CONNECT_RESULT",
      requestId,
      false,
      "Invalid LumenClip endpoint"
    )
    return
  }
  if (
    endpoint.origin !== window.location.origin ||
    config?.version !== 1 ||
    typeof config?.token !== "string"
  ) {
    respond(
      "LUMENCLIP_TIKTOK_COMMENTS_CONNECT_RESULT",
      requestId,
      false,
      "Invalid companion connection"
    )
    return
  }

  chrome.runtime.sendMessage({ type: "SET_CONFIG", config }, (result) => {
    const error = chrome.runtime.lastError?.message || result?.error
    respond(
      "LUMENCLIP_TIKTOK_COMMENTS_CONNECT_RESULT",
      requestId,
      Boolean(result?.ok),
      error
    )
  })
}

function parseEndpoint(value) {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

function respond(type, requestId, ok, error) {
  window.postMessage(
    {
      source: "lumenclip-companion",
      type,
      requestId,
      ok,
      error,
    },
    window.location.origin
  )
}
