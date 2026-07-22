import { NextResponse } from "next/server"

import {
  getCurrentUser,
  getUserPreferences,
  updateUserPreferences,
} from "@/lib/auth"
import { clean, isRecord } from "@/lib/guards"
import { listAutomationRecords, patchAutomationRecord } from "@/lib/automations"
import { listVisiblePostFastIntegrationPayload } from "@/lib/postfast-integrations"
import { postfastRouteError } from "@/lib/postfast-route"
import { listXAutomations, upsertXAutomation } from "@/lib/x-automation-store"

export const dynamic = "force-dynamic"

export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const { integrations, disconnectedIntegrations } =
      await listVisiblePostFastIntegrationPayload(user.$id)
    return NextResponse.json({
      integrations,
      disconnectedIntegrations,
      configured: true,
    })
  } catch (error) {
    return postfastRouteError(error)
  }
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const payload = await request.json().catch(() => null)
  const id = clean(isRecord(payload) ? payload.integrationId : "")
  if (!id) {
    return NextResponse.json(
      { error: "integrationId is required" },
      { status: 400 }
    )
  }

  try {
    const preferences = await getUserPreferences(user.$id)
    const disconnectedIds = new Set(disconnectedIntegrationIds(preferences))
    disconnectedIds.add(id)
    await updateUserPreferences(user.$id, {
      postfastDisconnectedIntegrationIds: [...disconnectedIds],
    })
    const removedFromAutomations = await removeIntegrationFromAutomations(id)
    return NextResponse.json({
      disconnected: true,
      integrationId: id,
      removedFromAutomations,
    })
  } catch (error) {
    return postfastRouteError(error)
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const payload = await request.json().catch(() => null)
  const id = clean(isRecord(payload) ? payload.integrationId : "")
  if (!id) {
    return NextResponse.json(
      { error: "integrationId is required" },
      { status: 400 }
    )
  }

  try {
    const preferences = await getUserPreferences(user.$id)
    await updateUserPreferences(user.$id, {
      postfastDisconnectedIntegrationIds: disconnectedIntegrationIds(
        preferences
      ).filter((integrationId) => integrationId !== id),
    })
    return NextResponse.json({ restored: true, integrationId: id })
  } catch (error) {
    return postfastRouteError(error)
  }
}

function disconnectedIntegrationIds(value: unknown) {
  if (!isRecord(value)) return []
  return Array.isArray(value.postfastDisconnectedIntegrationIds)
    ? value.postfastDisconnectedIntegrationIds.map(clean).filter(Boolean)
    : []
}

async function removeIntegrationFromAutomations(integrationId: string) {
  let removed = 0
  for (const automation of await listAutomationRecords()) {
    const integrations = automation.schema.social_integrations.filter(
      (integration) => integration.integration_id !== integrationId
    )
    if (integrations.length === automation.schema.social_integrations.length) {
      continue
    }
    await patchAutomationRecord({
      id: automation.id,
      schema: { ...automation.schema, social_integrations: integrations },
    })
    removed += 1
  }
  for (const automation of await listXAutomations()) {
    const integrations = automation.publishing.integrations.filter(
      (integration) => integration.integration_id !== integrationId
    )
    if (integrations.length === automation.publishing.integrations.length) {
      continue
    }
    await upsertXAutomation({
      ...automation,
      publishing: { ...automation.publishing, integrations },
      updatedAt: new Date().toISOString(),
    })
    removed += 1
  }
  return removed
}
