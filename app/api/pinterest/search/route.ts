import { NextResponse } from "next/server"

import {
  createFallbackPinterestResults,
  runPinterestImport,
} from "@/lib/pinterest-search"

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

  return searchPinterest(query, safeLimit, readPayloadApiKey(firstPayload), mode)
}

async function searchPinterest(query: string, safeLimit: number, payloadApiKey = "", mode: "search" | "board" = "search") {
  if (!query) {
    return NextResponse.json({ error: "Query is required" }, { status: 400 })
  }

  const token = payloadApiKey || process.env.APIFY_KEY

  if (!token) {
    return NextResponse.json({
      source: "fallback",
      results: createFallbackPinterestResults(query, safeLimit),
    })
  }

  try {
    const results = await runPinterestImport(query, safeLimit, token, mode)

    return NextResponse.json({
      source: "pinterest",
      results,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Pinterest import failed",
      },
      { status: 502 }
    )
  }
}

function readPayloadQuery(value: unknown) {
  if (!value || typeof value !== "object") {
    return ""
  }

  const query = (value as { query?: unknown }).query
  return typeof query === "string" ? query.trim() : ""
}

function readPayloadApiKey(value: unknown) {
  if (!value || typeof value !== "object") {
    return ""
  }

  const apiKey = (value as { apiKey?: unknown }).apiKey
  return typeof apiKey === "string" ? apiKey.trim() : ""
}

function readPayloadMode(value: unknown): "search" | "board" {
  if (!value || typeof value !== "object") {
    return "search"
  }

  const mode = (value as { mode?: unknown }).mode
  return mode === "board" ? "board" : "search"
}
