"use client"

export type TikTokStudioCompanionConfig = {
  version: 3
  endpoint: string
  token: string
  expiresAt: string
}

export type DiscoveredTikTokStudioPost = {
  externalPostId: string
  releaseUrl: string
  accountHandle?: string
  content?: string
  publishedAt?: string
}

const REQUEST_TYPE = "LUMENCLIP_TIKTOK_STUDIO_CONNECT"
const RESPONSE_TYPE = "LUMENCLIP_TIKTOK_STUDIO_CONNECT_RESULT"
const DISCOVER_REQUEST_TYPE = "LUMENCLIP_TIKTOK_STUDIO_DISCOVER"
const DISCOVER_RESPONSE_TYPE = "LUMENCLIP_TIKTOK_STUDIO_DISCOVER_RESULT"

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
        reject(
          new Error(event.data.error || "Chrome companion connection failed")
        )
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

export function discoverTikTokStudioPosts(timeoutMs = 90_000) {
  const requestId = crypto.randomUUID()
  return new Promise<DiscoveredTikTokStudioPost[]>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup()
      reject(
        new Error(
          "The Chrome companion could not read TikTok Studio. Reload version 2.3.0 and try again."
        )
      )
    }, timeoutMs)
    const onMessage = (event: MessageEvent) => {
      if (
        event.source !== window ||
        event.origin !== window.location.origin ||
        event.data?.source !== "lumenclip-companion" ||
        event.data?.type !== DISCOVER_RESPONSE_TYPE ||
        event.data?.requestId !== requestId
      ) {
        return
      }
      cleanup()
      if (!event.data.ok) {
        reject(new Error(event.data.error || "TikTok posts were not found"))
        return
      }
      const posts = event.data.result?.posts
      if (!Array.isArray(posts) || posts.length === 0) {
        reject(new Error("No posts were found in TikTok Studio Content"))
        return
      }
      resolve(posts)
    }
    const cleanup = () => {
      window.clearTimeout(timer)
      window.removeEventListener("message", onMessage)
    }

    window.addEventListener("message", onMessage)
    window.postMessage(
      {
        source: "lumenclip-web",
        type: DISCOVER_REQUEST_TYPE,
        requestId,
      },
      window.location.origin
    )
  })
}
