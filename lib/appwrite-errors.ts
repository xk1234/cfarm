type AppwriteLikeError = {
  code?: unknown
  type?: unknown
  message?: unknown
  response?: unknown
  cause?: unknown
}

export function isAppwriteQuotaError(error: unknown): boolean {
  const details = appwriteErrorDetails(error)
  return (
    details.code === 429 ||
    /(?:^|_)(?:limit|quota|usage|resource_limit).*exceed/i.test(details.type) ||
    /quota|resource limit|usage limit|rate limit|reads? limit|writes? limit/i.test(
      details.message
    )
  )
}

export function toLumenClipDataError(error: unknown): Error {
  if (!isAppwriteQuotaError(error)) {
    return error instanceof Error ? error : new Error(String(error))
  }
  const { type } = appwriteErrorDetails(error)
  return new Error(
    [
      "LumenClip data is temporarily unavailable because the Appwrite quota or rate limit was exceeded.",
      "This is not an empty result and does not mean the requested record is missing.",
      "Retry after the limit resets or increase the Appwrite limit.",
      type ? `(Appwrite type: ${type})` : "",
    ]
      .filter(Boolean)
      .join(" ")
  )
}

function appwriteErrorDetails(error: unknown) {
  const visited = new Set<unknown>()
  const queue: unknown[] = [error]
  let code: number | null = null
  const types: string[] = []
  const messages: string[] = []

  while (queue.length > 0) {
    const value = queue.shift()
    if (value == null || visited.has(value)) continue
    visited.add(value)
    if (typeof value === "string") {
      messages.push(value)
      continue
    }
    if (typeof value !== "object") continue
    const candidate = value as AppwriteLikeError
    const numericCode = Number(candidate.code)
    if (code == null && Number.isFinite(numericCode)) code = numericCode
    if (typeof candidate.type === "string") types.push(candidate.type)
    if (typeof candidate.message === "string") {
      messages.push(candidate.message)
    }
    if (candidate.response) queue.push(candidate.response)
    if (candidate.cause) queue.push(candidate.cause)
  }

  return {
    code,
    type: types.join(" "),
    message: messages.join(" "),
  }
}
