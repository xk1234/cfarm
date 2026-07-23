// Shared API primitives (audit V1). `withHandler` gives every route uniform
// error handling — known errors map to their status, everything else becomes a
// generic 500 instead of leaking `error.message` or relying on Next's default.
// Success SHAPES are intentionally left to each route (named-key convention),
// so adopting this is non-breaking for existing clients.
import { NextResponse } from "next/server"
import type { ZodType } from "zod"

/** Throw to return a specific status + safe message from a handler. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message)
    this.name = "ApiError"
  }
}

/** Standard `{ error }` failure body. */
export function fail(status: number, message: string) {
  return NextResponse.json({ error: message }, { status })
}

/**
 * `{ error }` body that intentionally surfaces an upstream/provider message.
 * Use in routes that proxy an external provider (KIE, OpenRouter, etc.) where
 * the provider's own error is actionable for the caller — unlike `withHandler`,
 * which hides internal errors behind a generic 500.
 */
export function providerFail(
  error: unknown,
  fallback: string,
  status = 500
) {
  return fail(
    status,
    error instanceof Error ? error.message : fallback
  )
}

/** Read + trim a dynamic route's `id` param, returning null when empty. */
export async function readRouteId(
  params: Promise<{ id: string }>
): Promise<string | null> {
  const { id } = await params
  const trimmed = id?.trim()
  return trimmed ? trimmed : null
}

/**
 * Validate a parsed request body against a zod schema. Throws `ApiError(400)`
 * with a readable `field: message` on failure, so routes get a clean 400 (via
 * `withHandler` or an existing try/catch that surfaces `error.message`) instead
 * of a loose `as Type` cast that lets malformed input through.
 */
export function validate<S extends ZodType>(
  schema: S,
  data: unknown
): S["_output"] {
  const result = schema.safeParse(data)
  if (!result.success) {
    const issue = result.error.issues[0]
    const path = issue?.path.join(".")
    const message = issue
      ? `${path ? `${path}: ` : ""}${issue.message}`
      : "Invalid request body"
    throw new ApiError(400, message)
  }
  return result.data
}

type RouteHandler<Ctx> = (request: Request, context: Ctx) => Promise<Response>
type ContextFreeRouteHandler = (request: Request) => Promise<Response>

/** Wrap a route handler with uniform try/catch + error mapping. */
export function withHandler(
  handler: ContextFreeRouteHandler
): ContextFreeRouteHandler
export function withHandler<Ctx>(handler: RouteHandler<Ctx>): RouteHandler<Ctx>
export function withHandler<Ctx>(
  handler: RouteHandler<Ctx> | ContextFreeRouteHandler
) {
  return async (request: Request, context: Ctx) => {
    try {
      return await handler(request, context as Ctx)
    } catch (error) {
      if (error instanceof ApiError) {
        return fail(error.status, error.message)
      }
      console.error(`[api] ${request.method} ${request.url}`, error)
      return fail(500, "Internal server error")
    }
  }
}
