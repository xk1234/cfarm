import { NextResponse } from "next/server"

import { providerFail } from "@/lib/api"

import { ensureHdbTrendsKnowledgeBase, upsertKnowledgeBase } from "@/lib/knowledge-bases"

export const dynamic = "force-dynamic"

export async function GET() {
  return NextResponse.json({ knowledgeBases: await ensureHdbTrendsKnowledgeBase() })
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const knowledgeBase = await upsertKnowledgeBase(body)
    return NextResponse.json({ knowledgeBase }, { status: 201 })
  } catch (error) {
    return providerFail(error, "Unable to save knowledge base", 400)
  }
}

