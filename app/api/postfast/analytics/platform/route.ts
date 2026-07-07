import { NextResponse } from "next/server"

import { postfastRequest } from "@/lib/postfast-client"
import { postfastRouteError } from "@/lib/postfast-route"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const integrationId = searchParams.get("integrationId")?.trim()
  const days = Math.max(1, Number(searchParams.get("days") ?? 30) || 30)

  if (!integrationId) {
    return NextResponse.json({ error: "An integrationId is required" }, { status: 400 })
  }

  try {
    const endDate = new Date()
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000)
    const payload = await postfastRequest("/social-posts/analytics", {
      query: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        socialMediaIds: integrationId,
      },
    })
    return NextResponse.json({ analytics: analyticsMetrics(payload) })
  } catch (error) {
    return postfastRouteError(error)
  }
}

function analyticsMetrics(payload: unknown) {
  const payloadRecord = recordValue(payload)
  const posts: unknown[] = Array.isArray(payloadRecord.data)
    ? payloadRecord.data
    : []
  const metricNames = [
    "likes",
    "comments",
    "shares",
    "impressions",
    "reach",
    "totalInteractions",
    "videoViews",
  ]

  return metricNames.map((metricName) => ({
    label: labelForMetric(metricName),
    data: posts.flatMap((post) => {
      const record = recordValue(post)
      const latestMetric = recordValue(record.latestMetric)
      const total = latestMetric[metricName]
      const date = stringValue(record.publishedAt)
      return date && total !== undefined
        ? [{ date, total: typeof total === "number" ? total : stringValue(total) }]
        : []
    }),
  })).filter((metric) => metric.data.length > 0)
}

function labelForMetric(metric: string) {
  return metric.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase())
}

function recordValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}
