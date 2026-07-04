"use client"

import { useState } from "react"
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { AppModal, AppModalPanel } from "@/components/ui/modal"
import {
  TemplateGeneratedPreview,
  generatedExampleSlides,
  type GeneratedShowcaseRun,
} from "@/components/realfarm/template-showcase-preview"
import type { CreatedImageCollection } from "@/lib/realfarm-collections"
import type { AutomationSchema } from "@/lib/realfarm-automation"
import type { Automation, RealFarmData } from "@/lib/realfarm-data"
import { cn } from "@/lib/utils"

export function FormatPickerModal({
  data,
  automations,
  automationConfigs,
  collections,
  recentRunsByAutomationId,
  onClose,
  onSelect,
}: {
  data: RealFarmData
  automations: Automation[]
  automationConfigs: Record<string, AutomationSchema>
  collections: CreatedImageCollection[]
  recentRunsByAutomationId: Record<string, GeneratedShowcaseRun[]>
  onClose: () => void
  onSelect: (index: number) => void
}) {
  const [selectedFormatIndex, setSelectedFormatIndex] = useState(0)

  return (
    <AppModal onClose={onClose}>
      <AppModalPanel className="flex h-[min(700px,88vh)] w-[min(720px,calc(100vw-64px))] flex-col rounded-[14px]">
        <div className="flex h-12 items-center border-b border-[#e1e0d8] px-3">
          <button
            className="flex items-center gap-1 text-[13px] font-medium text-[#6f6e69]"
            onClick={onClose}
          >
            <IconChevronLeft className="size-4" />
            Back
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-5">
          <div className="mb-5">
            <h2 className="text-[20px] font-semibold tracking-normal text-[#242421]">
              Select automation
            </h2>
            <p className="mt-1 text-[13px] font-medium text-[#6f6e69]">
              Choose from your own automations.
            </p>
          </div>

          {automations.length === 0 ? (
            <div className="grid min-h-[220px] place-items-center rounded-[8px] border border-dashed border-[#d7d6cf] bg-[#f8f8f4] px-4 text-center">
              <div>
                <div className="text-[15px] font-bold text-[#333]">
                  No automations available
                </div>
                <div className="mt-2 text-[12px] font-semibold text-[#77766f]">
                  Create an automation first, then select it here.
                </div>
              </div>
            </div>
          ) : (
            <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
              {automations.map((automation, index) => (
                <button
                  key={automation.id}
                  className={cn(
                    "group rounded-[7px] p-1 text-left transition hover:bg-[#f7f7f3]",
                    selectedFormatIndex === index &&
                      "bg-[#f7f7f3] ring-1 ring-[#d7d6cf]"
                  )}
                  onClick={() => setSelectedFormatIndex(index)}
                  onDoubleClick={() => onSelect(index)}
                >
                  <TemplateGeneratedPreview
                    exampleSlides={generatedExampleSlides(
                      recentRunsByAutomationId[automation.id],
                      3
                    )}
                    className="h-[86px] rounded-[5px] transition group-hover:brightness-95"
                    index={index}
                  />
                  <div className="mt-2 flex items-center justify-between gap-2 px-1 text-[13px] font-semibold text-[#242421]">
                    <span className="min-w-0 truncate">{automation.name}</span>
                    <IconChevronRight className="size-4 shrink-0 text-[#242421]" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-[#e1e0d8] p-3">
          <Button
            variant="action"
            size="appDefault"
            className="w-full"
            disabled={automations.length === 0}
            onClick={() => onSelect(selectedFormatIndex)}
          >
            Select automation
          </Button>
        </div>
      </AppModalPanel>
    </AppModal>
  )
}
