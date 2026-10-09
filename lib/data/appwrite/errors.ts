/**
 * Appwrite error classification (recovered from the old lib/appwrite-errors.ts,
 * plus 404/409 helpers). Maps SDK errors onto the data-layer error classes.
 */
import { DataConflictError, DataNotFoundError, DataQuotaError } from "../repositories"

type AppwriteLikeError = {
  code?: unknown
  type?: unknown
  message?: unknown
  response?: unknown
  cause?: unknown
}

export function appwriteErrorDetails(error: unknown) {
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
    if (code == null && Number.isFinite(numericCode) && numericCode > 0) code = numericCode
    if (typeof candidate.type === "string") types.push(candidate.type)
    if (typeof candidate.message === "string") messages.push(candidate.message)
    if (candidate.response && typeof candidate.response === "object") queue.push(candidate.response)
    if (candidate.cause) queue.push(candidate.cause)
  }

  return { code, type: types.join(" "), message: messages.join(" ") }
}

export function isAppwriteQuotaError(error: unknown): boolean {
  const details = appwriteErrorDetails(error)
  return (
    details.code === 429 ||
    /(?:^|_)(?:limit|quota|usage|resource_limit).*exceed/i.test(details.type) ||
    /quota|resource limit|usage limit|rate limit|reads? limit|writes? limit/i.test(details.message)
  )
}

export function isNotFound(error: unknown): boolean {
  return appwriteErrorDetails(error).code === 404
}

export function isConflict(error: unknown): boolean {
  return appwriteErrorDetails(error).code === 409
}

/** Re-throws quota errors as DataQuotaError; everything else unchanged. */
export function toDataError(error: unknown): Error {
  if (
    error instanceof DataNotFoundError ||
    error instanceof DataConflictError ||
    error instanceof DataQuotaError
  ) {
    return error
  }
  if (isAppwriteQuotaError(error)) {
    const { type } = appwriteErrorDetails(error)
    return new DataQuotaError(
      [
        "LumenClip data is temporarily unavailable because the Appwrite quota or rate limit was exceeded.",
        "This is not an empty result and does not mean the requested record is missing.",
        type ? `(Appwrite type: ${type})` : "",
      ]
        .filter(Boolean)
        .join(" ")
    )
  }
  return error instanceof Error ? error : new Error(String(error))
}

/** A stored row failed validation on read. */
export class DataIntegrityError extends Error {
  constructor(table: string, id: string, detail: string) {
    super(`Row ${table}/${id} is invalid: ${detail}`)
    this.name = "DataIntegrityError"
  }
}
