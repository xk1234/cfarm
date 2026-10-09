/**
 * In-app render routes (Clerk session). `/api/renders/**` is an alias of
 * `/api/v1/renders/**`, so the app and the public API share one implementation:
 *
 * - `GET|POST /api/renders`, `GET|DELETE /api/renders/{id}`
 * - `GET /api/renders/{id}/slides/{index}`, `GET /api/renders/{id}/zip`
 */
import { openApiApp } from "@/lib/openapi-app"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

async function forward(request: Request) {
  const url = new URL(request.url)
  url.pathname = url.pathname.replace(/^\/api\/renders/, "/api/v1/renders")
  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers: request.headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer(),
  }
  return openApiApp.fetch(new Request(url, init))
}

export const GET = forward
export const POST = forward
export const DELETE = forward
