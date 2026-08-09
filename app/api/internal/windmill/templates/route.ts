import { authorizeWindmillRequest } from "@/lib/windmill-auth"
import { listAutomationRecords } from "@/lib/automations"
import { clean, isRecord } from "@/lib/guards"
import { withSystemOwner } from "@/lib/system-owner-context"
import { listXAutomations } from "@/lib/x-automation-store"

export const dynamic = "force-dynamic"

type TemplateKind = "slideshow" | "ugc" | "x_threads"

export async function POST(request: Request) {
  if (!authorizeWindmillRequest(request.headers.get("authorization"))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }
  const body = (await request.json().catch(() => null)) as unknown
  if (!isRecord(body)) {
    return Response.json(
      { error: "ownerId and kind are required" },
      { status: 400 }
    )
  }
  const ownerId = clean(body.ownerId)
  const kind = clean(body.kind) as TemplateKind
  if (!ownerId || !isTemplateKind(kind)) {
    return Response.json(
      { error: "ownerId and kind are required" },
      { status: 400 }
    )
  }

  const options = await withSystemOwner(ownerId, async () => {
    if (kind === "x_threads") {
      return (await listXAutomations())
        .filter((record) => !record.hidden)
        .map((record) => ({ value: record.id, label: record.name }))
    }
    return (await listAutomationRecords())
      .filter(
        (record) => !record.hidden && record.schema.automationKind === kind
      )
      .map((record) => ({ value: record.id, label: record.name }))
  })

  return Response.json({ options })
}

function isTemplateKind(value: string): value is TemplateKind {
  return value === "slideshow" || value === "ugc" || value === "x_threads"
}
