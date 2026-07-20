import { NextResponse } from "next/server"

import { internalToolsEnabled } from "@/lib/internal-tools"

import { filterOpenRouterTextStructuredModels } from "@/lib/openrouter-models"

export const dynamic = "force-dynamic"

type OpenRouterModelsResponse = {
  data?: unknown[]
}

export async function GET() {
  if (!internalToolsEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  try {
    const response = await fetch("https://openrouter.ai/api/v1/models", {
      headers: {
        Accept: "application/json",
      },
      next: { revalidate: 3600 },
    })

    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to load OpenRouter models" },
        { status: response.status }
      )
    }

    const payload = (await response.json()) as OpenRouterModelsResponse
    const models = filterOpenRouterTextStructuredModels(
      Array.isArray(payload.data) ? payload.data : []
    )
    return NextResponse.json({ models })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load OpenRouter models",
      },
      { status: 500 }
    )
  }
}
