import { NextResponse } from "next/server"

import {
  createFallbackPexelsResults,
  runPexelsSearch,
} from "@/lib/pexels-search"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const query = (url.searchParams.get("query") ?? "").trim()
  const limit = Number(url.searchParams.get("limit") ?? "20")
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 80)) : 20

  return searchPexels(query, safeLimit)
}

export async function POST(request: Request) {
  const url = new URL(request.url)
  const limit = Number(url.searchParams.get("limit") ?? "20")
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 80)) : 20
  const body = (await request.json().catch(() => null)) as unknown
  const query = readPayloadQuery(Array.isArray(body) ? body[0] : body)

  return searchPexels(query, safeLimit)
}

async function searchPexels(query: string, safeLimit: number) {
  if (!query) {
    return NextResponse.json({ error: "Query is required" }, { status: 400 })
  }

  const apiKey = process.env.PEXELS_KEY
  if (!apiKey) {
    return NextResponse.json({
      source: "pexels-fallback",
      results: createFallbackPexelsResults(query, safeLimit),
    })
  }

  try {
    return NextResponse.json({
      source: "pexels",
      results: await runPexelsSearch(query, safeLimit, apiKey),
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Pexels search failed" },
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
