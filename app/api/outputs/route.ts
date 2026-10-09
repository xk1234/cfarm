import { NextResponse } from "next/server"

import { withHandler } from "@/lib/api"
import { listContentOutputs } from "@/lib/content-output-repository"
import { clean } from "@/lib/guards"

export const dynamic = "force-dynamic"

export const GET = withHandler(async (request: Request) => {
  const url = new URL(request.url)
  const requestedKind = clean(url.searchParams.get("kind"))
  const requestedStatus = clean(url.searchParams.get("status"))
  const templateId = clean(url.searchParams.get("templateId"))
  const outputId = clean(url.searchParams.get("id"))
  const outputs = (await listContentOutputs())
    .filter((item) => !requestedKind || item.kind === requestedKind)
    .filter((item) => !requestedStatus || item.status === requestedStatus)
    .filter((item) => !templateId || item.templateId === templateId)
    .filter((item) => !outputId || item.id === outputId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))

  return NextResponse.json({ outputs })
})

export const POST = withHandler(async () => {
  return NextResponse.json(
    {
      error:
        "Outputs are immutable generation results. Generate a template to create one.",
    },
    { status: 405 }
  )
})
