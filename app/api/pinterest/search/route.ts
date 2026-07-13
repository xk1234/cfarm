import { NextResponse } from "next/server"

import { providerFail } from "@/lib/api"

import { runPinterestImport } from "@/lib/pinterest-search"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const query = (url.searchParams.get("query") ?? "").trim()
  const limit = Number(url.searchParams.get("limit") ?? "20")
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 100)) : 20

  return searchPinterest(query, safeLimit)
}

export async function POST(request: Request) {
  const url = new URL(request.url)
  const limit = Number(url.searchParams.get("limit") ?? "20")
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 100)) : 20
  const body = (await request.json().catch(() => null)) as unknown
  const firstPayload = Array.isArray(body) ? body[0] : body
  const query = readPayloadQuery(firstPayload)
  const mode = readPayloadMode(firstPayload)

  return searchPinterest(query, safeLimit, mode)
}

async function searchPinterest(
  query: string,
  safeLimit: number,
  mode: "search" | "board" = "search"
) {
  if (!query) {
    return NextResponse.json({ error: "Query is required" }, { status: 400 })
  }

  const token = process.env.APIFY_KEY

  if (!token) {
    return NextResponse.json(
      { error: "APIFY_KEY is not configured" },
      { status: 500 }
    )
  }

  try {
    const results = await runPinterestImport(query, safeLimit, token, mode)

    return NextResponse.json({
      source: "pinterest",
      results,
    })
  } catch (error) {
    return providerFail(error, "Pinterest import failed", 502)
  }
}

function readPayloadQuery(value: unknown) {
  if (!value || typeof value !== "object") {
    return ""
  }

  const query = (value as { query?: unknown }).query
  return typeof query === "string" ? query.trim() : ""
}

function readPayloadMode(value: unknown): "search" | "board" {
  if (!value || typeof value !== "object") {
    return "search"
  }

  const mode = (value as { mode?: unknown }).mode
  return mode === "board" ? "board" : "search"
}
