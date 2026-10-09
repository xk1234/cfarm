/**
 * Route helpers for publishing, calendar and notification APIs: Clerk session
 * → workspace id, and publishing errors → HTTP statuses with user-facing text.
 */
import "server-only"

import { ApiError, withHandler } from "@/lib/api"
import { getCurrentUser } from "@/lib/auth"
import { DataNotFoundError, type WorkspaceId } from "@/lib/data"

import { PublisherNotConfiguredError, PublisherRequestError, PUBLISHER_NOT_CONNECTED_MESSAGE } from "./publisher"
import { PublishingInputError } from "./service"

export type WorkspaceUser = { workspaceId: WorkspaceId; userId: string }

/** Single-user workspaces: the workspace id is the Clerk-backed user id. */
export async function requireWorkspace(): Promise<WorkspaceUser> {
  const user = await getCurrentUser()
  if (!user) throw new ApiError(401, "Unauthorized")
  return { workspaceId: user.$id, userId: user.$id }
}

export function toApiError(error: unknown): unknown {
  if (error instanceof ApiError) return error
  if (error instanceof PublisherNotConfiguredError) return new ApiError(503, PUBLISHER_NOT_CONNECTED_MESSAGE)
  if (error instanceof PublishingInputError) return new ApiError(error.status, error.message)
  if (error instanceof DataNotFoundError) return new ApiError(404, `${capitalize(error.entity)} not found.`)
  if (error instanceof PublisherRequestError) {
    const status = error.status === 400 || error.status === 422 ? 422 : error.status === 429 ? 429 : 502
    return new ApiError(status, error.message)
  }
  return error
}

function capitalize(value: string) {
  return value ? value[0]!.toUpperCase() + value.slice(1) : value
}

type Handler<Ctx> = (request: Request, context: Ctx) => Promise<Response>

/** `withHandler` plus publishing error mapping. */
export function publishingRoute<Ctx = unknown>(handler: Handler<Ctx>): Handler<Ctx> {
  return withHandler<Ctx>(async (request, context) => {
    try {
      return await handler(request, context)
    } catch (error) {
      throw toApiError(error)
    }
  })
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    throw new ApiError(400, "Invalid JSON body")
  }
}
