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
      captions: { enabled: true, style: "karaoke", fallback: "drawtext" as const },
      hookOverlay: { enabled: true, durationMs: 3000, style: "bold" },
      ...patch,
    },
  }
}

describe("UgcAutomationFormatPanel", () => {
  it("blocks saving a live automation without product input or voice", () => {
    const save = vi.fn()
    const html = renderToStaticMarkup(
      <UgcAutomationFormatPanel
        config={{
          ...schema({ voiceId: "" }),
          ugc: { ...schema({ voiceId: "" }).ugc, productUrl: "", productBrief: "" },
        }}
        onConfigChange={vi.fn()}
        onBack={vi.fn()}
        onSave={save}
      />
    )

    expect(html).toContain("Add a product URL or product brief")
    expect(html).toContain("Choose a voice before going live")
    expect(html).toContain("disabled=\"\"")
    expect(save).not.toHaveBeenCalled()
  })
})
