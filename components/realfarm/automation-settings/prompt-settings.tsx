import { SelectControl, SwitchPill } from "@/components/ui/form-controls"
import {
  automationHooks,
  automationTone,
  schemaWithAutomationHooks,
  schemaWithAutomationTone,
  type AutomationSchema,
} from "@/lib/realfarm-automation"
import type { Automation } from "@/lib/realfarm-data"
import { cn } from "@/lib/utils"

import { SettingsFooter, SettingsPage, SettingsRow } from "./settings-layout"

export function PromptTextarea({
  title,
  value,
  large,
  onChange,
}: {
  title: string
  value: string
  large?: boolean
  onChange?: (value: string) => void
}) {
  return (
    <label className="block">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[15px] font-semibold text-[#242421]">
          {title}
        </span>
        <span className="flex items-center gap-2 text-[13px] font-semibold text-[#62615b]">
          Use prompt <SwitchPill enabled />
        </span>
      </div>
      <textarea
        className={cn(
          "w-full resize-none rounded-[8px] border border-[#d8d7cf] bg-white p-4 text-[14px] leading-6 font-medium outline-none focus:border-[#9f9e96]",
          large ? "h-32" : "h-24"
        )}
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
      />
    </label>
  )
}

export function PromptConfigPanel({
  automation,
  config,
  onConfigChange,
  onCancel,
  onSave,
}: {
  automation: Automation
  config: AutomationSchema
  onConfigChange: (config: AutomationSchema) => void
  onCancel: () => void
  onSave: () => void
}) {
  function updateHooks(value: string) {
    const hooks = value
      .split("\n")
      .map((line) => line.replace(/^\s*\d+\.\s*/, "").trim())
      .filter(Boolean)
    onConfigChange(schemaWithAutomationHooks(config, hooks))
  }

  function updateTone(value: string) {
    onConfigChange(schemaWithAutomationTone(config, value))
  }

  const tonePresets = [
    "Conversational & Relatable",
    "Motivational & Empowering",
    "Educational & Informative",
    "Bold & Provocative",
    "Calm & Reflective",
    "Witty & Humorous",
  ]
  const currentTone = automationTone(config)
  const selectedTone = tonePresets.includes(currentTone)
    ? currentTone
    : "Custom"

  return (
    <SettingsPage
      title="Hooks & Style"
      description={`Edit the narrative hooks and generation tone for ${automation.name}.`}
    >
      <div className="space-y-6">
        <SettingsRow
          title="Tone"
          description="Voice used for generated slide text."
          control={
            <SelectControl
              value={selectedTone}
              onChange={(event) => {
                const value = event.target.value
                updateTone(
                  value === "Custom"
                    ? "Write in a custom tone for this automation."
                    : value
                )
              }}
            >
              {[...tonePresets, "Custom"].map((tone) => (
                <option key={tone} value={tone}>
                  {tone}
                </option>
              ))}
            </SelectControl>
          }
        />
        {selectedTone === "Custom" ? (
          <label className="block">
            <div className="mb-2">
              <div className="text-[16px] font-semibold text-[#242421]">
                Custom tone
              </div>
              <div className="mt-1 text-[14px] font-medium text-[#77766f]">
                Full voice and style instruction used for generated slide text.
              </div>
            </div>
            <textarea
              className="h-44 w-full resize-none rounded-[8px] border border-[#deddd5] bg-white p-5 text-[14px] leading-6 font-medium outline-none focus:border-[#9f9e96]"
              value={currentTone}
              onChange={(event) => updateTone(event.target.value)}
            />
          </label>
        ) : null}
        <label className="block">
          <div className="mb-2">
            <div className="text-[16px] font-semibold text-[#242421]">
              Hooks
            </div>
            <div className="mt-1 text-[14px] font-medium text-[#77766f]">
              One hook per line. These feed the slideshow editor and runner.
            </div>
          </div>
          <textarea
            className="h-72 w-full resize-none rounded-[8px] border border-[#deddd5] bg-white p-5 text-[14px] leading-6 font-medium outline-none focus:border-[#9f9e96]"
            value={automationHooks(config).join("\n")}
            onChange={(event) => updateHooks(event.target.value)}
          />
        </label>
      </div>
      <SettingsFooter onCancel={onCancel} onSave={onSave} />
    </SettingsPage>
  )
}


