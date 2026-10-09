"use client"

export type TikTokCommentsCompanionConfig = {
  version: 1
  endpoint: string
  token: string
  expiresAt: string
}

export function connectTikTokCommentsCompanion(
  config: TikTokCommentsCompanionConfig,
  options: { timeoutMs?: number } = {}
) {
  const requestId = crypto.randomUUID()
  const timeoutMs = options.timeoutMs ?? 4_000
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup()
      reject(
        new Error(
          "TikTok comments companion not detected. Install or reload it, then retry."
        )
      )
    }, timeoutMs)
    const onMessage = (event: MessageEvent) => {
      if (
        event.source !== window ||
        event.origin !== window.location.origin ||
        event.data?.source !== "lumenclip-companion" ||
        event.data?.type !== "LUMENCLIP_TIKTOK_COMMENTS_CONNECT_RESULT" ||
        event.data?.requestId !== requestId
      ) {
        return
      }
      cleanup()
      if (event.data.ok) resolve()
      else reject(new Error(event.data.error || "Companion connection failed"))
    }
    const cleanup = () => {
      window.clearTimeout(timer)
      window.removeEventListener("message", onMessage)
    }
    window.addEventListener("message", onMessage)
    window.postMessage(
      {
        source: "lumenclip-web",
        type: "LUMENCLIP_TIKTOK_COMMENTS_CONNECT",
        requestId,
        config,
      },
      window.location.origin
    )
  })
}
