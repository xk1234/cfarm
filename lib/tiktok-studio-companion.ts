"use client"

export type TikTokStudioCompanionConfig = {
  version: 3
  endpoint: string
  token: string
  expiresAt: string
}

const REQUEST_TYPE = "LUMENCLIP_TIKTOK_STUDIO_CONNECT"
const RESPONSE_TYPE = "LUMENCLIP_TIKTOK_STUDIO_CONNECT_RESULT"

export function connectTikTokStudioCompanion(
  config: TikTokStudioCompanionConfig,
  options: { autoStart?: boolean; timeoutMs?: number } = {}
) {
  const requestId = crypto.randomUUID()
  const timeoutMs = options.timeoutMs ?? 4_000

  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup()
      reject(
        new Error(
          "Chrome companion not detected. Install or reload the latest companion, then retry."
        )
      )
    }, timeoutMs)
    const onMessage = (event: MessageEvent) => {
      if (
        event.source !== window ||
        event.origin !== window.location.origin ||
        event.data?.source !== "lumenclip-companion" ||
        event.data?.type !== RESPONSE_TYPE ||
        event.data?.requestId !== requestId
      ) {
        return
      }
      cleanup()
      if (event.data.ok) {
        resolve()
      } else {
        reject(new Error(event.data.error || "Chrome companion connection failed"))
      }
    }
    const cleanup = () => {
      window.clearTimeout(timer)
      window.removeEventListener("message", onMessage)
    }

    window.addEventListener("message", onMessage)
    window.postMessage(
      {
        source: "lumenclip-web",
        type: REQUEST_TYPE,
        requestId,
        config,
        autoStart: options.autoStart !== false,
      },
      window.location.origin
    )
  })
}
