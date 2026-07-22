import { NextResponse } from "next/server"

import type { ComposerValue } from "@/components/realfarm/composer/composer-types"
import { getCurrentUser } from "@/lib/auth"
import {
  composeLimitErrors,
  publishComposerValue,
  type ComposePublishMode,
} from "@/lib/compose-publishing"
import { listConnectedPostFastIntegrations } from "@/lib/postfast-integrations"
import { postfastRouteError } from "@/lib/postfast-route"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  }

  const payload = await request.json().catch(() => null)
  const value = composerValue(payload?.value)
  const selectedIds = Array.isArray(payload?.selectedAccountIds)
    ? payload.selectedAccountIds.filter((id: unknown): id is string => typeof id === "string")
    : []
  const mode: ComposePublishMode = payload?.mode === "schedule" ? "schedule" : "now"
  const scheduledAt = typeof payload?.scheduledAt === "string" ? payload.scheduledAt : undefined

  if (!value || selectedIds.length === 0) {
    return NextResponse.json(
      { error: "A composer value and at least one account are required" },
      { status: 400 }
    )
  }
  if (mode === "schedule") {
    const timestamp = Date.parse(scheduledAt ?? "")
    if (!Number.isFinite(timestamp) || timestamp <= Date.now()) {
      return NextResponse.json({ error: "Choose a future date and time" }, { status: 400 })
    }
  }

  try {
    const allowed = await listConnectedPostFastIntegrations(user.$id)
    const selected = allowed
      .filter((integration) => selectedIds.includes(integration.integration_id))
      .map((integration) => ({
        integrationId: integration.integration_id,
        platformKey: integration.provider,
        accountName: integration.name,
        handle: integration.profile ?? integration.name,
        avatarUrl: integration.picture,
      }))
    if (selected.length !== new Set(selectedIds).size) {
      return NextResponse.json(
        { error: "One or more selected accounts are not connected" },
        { status: 403 }
      )
    }
    const errors = composeLimitErrors(value, selected)
    if (errors.length > 0) {
      return NextResponse.json({ error: errors[0], errors }, { status: 422 })
    }

    const result = await publishComposerValue({
      value,
      accounts: selected,
      mode,
      scheduledAt,
      uploadMedia: (url) => uploadThroughPostFastSeam(url, request),
    })
    const succeeded = result.results.filter((item) => item.ok)
    const failed = result.results.filter((item) => !item.ok)
    return NextResponse.json(
      { ...result, succeeded, failed },
      { status: failed.length === result.results.length ? 502 : 200 }
    )
  } catch (error) {
    return postfastRouteError(error)
  }
}

async function uploadThroughPostFastSeam(url: string, request: Request) {
  const response = await fetch(new URL("/api/postfast/upload", request.url), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: request.headers.get("cookie") ?? "",
    },
    body: JSON.stringify({ url }),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.upload) {
    throw new Error(payload?.error || "Media upload failed")
  }
  return payload.upload
}

function composerValue(value: unknown): ComposerValue | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (!record.base || typeof record.base !== "object" || Array.isArray(record.base)) return null
  const base = record.base as Record<string, unknown>
  if (typeof base.text !== "string" || !Array.isArray(base.media)) return null
  return value as ComposerValue
}
