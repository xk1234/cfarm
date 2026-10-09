// Shared API primitives (audit V1). `withHandler` gives every route uniform
// error handling — known errors map to their status, everything else becomes a
// generic 500 instead of leaking `error.message` or relying on Next's default.
// Success SHAPES are intentionally left to each route (named-key convention),
// so adopting this is non-breaking for existing clients.
import { NextResponse } from "next/server"
import type { ZodType } from "zod"
import { randomUUID } from "node:crypto"

import { logger } from "@/lib/server-logger"

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
export function providerFail(error: unknown, fallback: string, status = 500) {
  return fail(status, error instanceof Error ? error.message : fallback)
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
    const requestId =
      request.headers.get("x-request-id")?.trim() || randomUUID()
    const startedAt = performance.now()
    const requestLogger = logger.child({
      requestId,
      method: request.method,
      path: new URL(request.url).pathname,
    })
    try {
      const response = await handler(request, context as Ctx)
      const identifiedResponse = responseWithRequestId(response, requestId)
      requestLogger.info(
        {
          status: response.status,
          durationMs: Math.round(performance.now() - startedAt),
        },
        "request completed"
      )
      return identifiedResponse
    } catch (error) {
      if (error instanceof ApiError) {
        requestLogger.warn(
          {
            status: error.status,
            durationMs: Math.round(performance.now() - startedAt),
          },
          error.message
        )
        const response = fail(error.status, error.message)
        return responseWithRequestId(response, requestId)
      }
      requestLogger.error(
        {
          err: error,
          status: 500,
          durationMs: Math.round(performance.now() - startedAt),
        },
        "request failed"
      )
      const response = fail(500, "Internal server error")
      return responseWithRequestId(response, requestId)
    }
  }
}

function responseWithRequestId(response: Response, requestId: string) {
  try {
    response.headers.set("x-request-id", requestId)
    return response
  } catch {
    const headers = new Headers(response.headers)
    headers.set("x-request-id", requestId)
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  }
}
