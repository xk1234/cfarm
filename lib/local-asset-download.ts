import path from "node:path"

import { persistAsset } from "@/lib/asset-storage"
import { fetchWithTimeout } from "@/lib/http"

type FetchLike = typeof fetch

export async function downloadRemoteFileToLocalAsset(input: {
  url: string
  taskId: string
  folder: string
  publicPrefix: string
  fallbackName: string
  failureMessage: string
  extensionForContentType: (contentType: string) => string
  fetchImpl?: FetchLike
}) {
  const response = await fetchWithTimeout(input.url, undefined, {
    fetchImpl: input.fetchImpl,
    timeoutMs: 120_000,
  })
  if (!response.ok) {
    throw new Error(input.failureMessage)
  }

  const extension = input.extensionForContentType(
    response.headers.get("content-type") ?? ""
  )
  const safeTaskId = input.taskId.replace(/[^a-zA-Z0-9_-]/g, "")
  const fileName = `${Date.now()}-${safeTaskId || input.fallbackName}${extension}`
  const filePath = path.join(input.folder, fileName)
  await persistAsset(filePath, Buffer.from(await response.arrayBuffer()))

  return `${input.publicPrefix}/${encodeURIComponent(fileName)}`
}
