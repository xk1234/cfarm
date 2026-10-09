import { NextResponse } from "next/server"

import { ApiError, readRouteId, withHandler } from "@/lib/api"
import {
  contentTemplateFromMediaRecord,
  contentTemplateFromPostRecord,
} from "@/lib/content-templates"
import { deleteAutomationRecord, getAutomationRecord } from "@/lib/automations"
import { deleteXAutomation, getXAutomation } from "@/lib/x-automation-store"

export const DELETE = withHandler<RouteContext<"/api/templates/[id]">>(
  async (_request, context) => {
    const id = await readRouteId(context.params)
    if (!id) throw new ApiError(400, "A template id is required")
    const text = await getXAutomation(id)
    if (text) {
      await deleteXAutomation(id)
      return NextResponse.json({ deleted: contentTemplateFromPostRecord(text) })
    }
    const media = await getAutomationRecord(id)
    if (!media) throw new ApiError(404, "Template not found")
    await deleteAutomationRecord({ id })
    return NextResponse.json({ deleted: contentTemplateFromMediaRecord(media) })
  }
)
