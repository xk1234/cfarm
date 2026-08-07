import {
  GET as getTemplates,
  PATCH as patchTemplate,
  POST as createTemplate,
} from "@/app/api/automations/route"

// Templates replaced automations as the authoring concept. Keep the existing
// storage/service implementation behind this route so historical records and
// MCP clients remain compatible while the app uses template URLs.
export const dynamic = "force-dynamic"

export const GET = getTemplates
export const POST = createTemplate
export const PATCH = patchTemplate
