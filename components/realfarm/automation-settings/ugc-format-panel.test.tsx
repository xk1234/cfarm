import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { generationModelRegistry } from "@/lib/realfarm-generation-model-registry"
import {
  defaultAutomationSchema,
  type AutomationSchema,
} from "@/lib/realfarm-automation"
import type { Automation } from "@/lib/realfarm-data"

import { UgcAutomationFormatPanel } from "./ugc-format-panel"

const automation: Automation = {
  id: "ugc-test",
  name: "UGC test",
  automationKind: "ugc",
  status: "paused",
  account: "",
  handle: "",
  times: [],
  favorite: false,
  theme: "ugc",
  socialIntegrations: [],
}

function schema(patch: Partial<AutomationSchema["ugc"]> = {}) {
  return {
    ...defaultAutomationSchema(automation),
    automationKind: "ugc" as const,
    status: "paused" as const,
    ugc: {
      enabled: true,
      actorSource: "generate" as const,
      actorPrompt: "Friendly creator",
      voiceId: generationModelRegistry.ugc.elevenLabsDefaultVoiceId,
      lipSyncTier: "standard" as const,
      targetDurationSeconds: 40,
      brollCount: 3,
      captions: {
        enabled: true,
        style: "karaoke",
        fallback: "drawtext" as const,
      },
      hookOverlay: { enabled: true, durationMs: 3000, style: "bold" },
      ...patch,
    },
  }
}

describe("UgcAutomationFormatPanel", () => {
  it("shows live validation without manual save controls", () => {
    const html = renderToStaticMarkup(
      <UgcAutomationFormatPanel
        config={{
          ...schema({ voiceId: "" }),
          ugc: {
            ...schema({ voiceId: "" }).ugc,
            productUrl: "",
            productBrief: "",
          },
        }}
        collections={[]}
        onCreateCollection={vi.fn()}
        onConfigChange={vi.fn()}
        onBack={vi.fn()}
      />
    )

    expect(html).toContain("Add a product URL or product brief")
    expect(html).toContain("Choose a voice before going live")
    expect(html).not.toContain("Save changes")
    expect(html).toContain("Back")
  })

  it("uses an image collection picker instead of exposing an asset URL", () => {
    const html = renderToStaticMarkup(
      <UgcAutomationFormatPanel
        config={schema({
          actorSource: "gallery",
          actorCollectionId: "actor-portraits",
        })}
        collections={[
          {
            id: "actor-portraits",
            title: "Actor portraits",
            createdAt: "2026-08-10T00:00:00.000Z",
            source: "upload",
            images: [
              {
                id: "portrait-1",
                title: "Portrait 1",
                description: "Portrait 1",
                imageUrl: "/portrait-1.jpg",
                sourceUrl: "/portrait-1.jpg",
                dominantColor: "#ddd",
              },
            ],
          },
        ]}
        onCreateCollection={vi.fn()}
        onConfigChange={vi.fn()}
        onBack={vi.fn()}
      />
    )

    expect(html).toContain("Actor image collection")
    expect(html).toContain("Actor portraits")
    expect(html).not.toContain("asset URL")
    expect(html.match(/type="url"/g)).toHaveLength(1)
  })
})
