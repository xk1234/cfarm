import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"

const healthResponse = z
  .object({
    status: z.literal("ok"),
    dataBackend: z.literal("railway"),
    assetBackend: z.literal("railway"),
    timestamp: z.iso.datetime(),
  })
  .openapi("HealthResponse")

const healthRoute = createRoute({
  method: "get",
  path: "/health",
  tags: ["System"],
  summary: "Check API availability",
  responses: {
    200: {
      description: "The API is available.",
      content: { "application/json": { schema: healthResponse } },
    },
  },
})

export const openApiApp = new OpenAPIHono().basePath("/api/v1")

openApiApp.openapi(healthRoute, (context) =>
  context.json(
    {
      status: "ok",
      dataBackend: "railway",
      assetBackend: "railway",
      timestamp: new Date().toISOString(),
    },
    200
  )
)

openApiApp.doc("/openapi.json", {
  openapi: "3.1.0",
  info: {
    title: "LumenClip API",
    version: "1.0.0",
    description: "Typed API contracts for LumenClip automation workflows.",
  },
})
