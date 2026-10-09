import { handle } from "hono/vercel"

import { openApiApp } from "@/lib/openapi-app"

const handler = handle(openApiApp)

export const GET = handler
export const POST = handler
export const PUT = handler
export const PATCH = handler
export const DELETE = handler
