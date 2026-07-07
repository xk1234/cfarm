"use client"

import type { ReactNode } from "react"
import { IconPhoto, IconX } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { SelectControl } from "@/components/ui/form-controls"
import type { AssetRecord } from "@/lib/assets"
import type { CharacterRecord } from "@/lib/characters"
import {
  characterWorkflowOptions,
  type CharacterImageGenerationRecord,
  type CharacterPromptAttachment,
  type CharacterWorkflowKey,
} from "@/lib/realfarm-character-ui"
import { cn } from "@/lib/utils"

import { clampNumber, referenceAssetReady } from "./workflow-helpers"

export function CharacterWorkflowEmptyState({
  characterName,
  onSelectWorkflow,
}: {
  characterName: string
  onSelectWorkflow: (workflow: CharacterWorkflowKey) => void
}) {
  const cards: Array<{
    workflow: CharacterWorkflowKey
    title: string
    description: string
  }> = [
    {
      workflow: "free_generate",
      title: "Generate First Image",
      description: "Create a scene from text.",
    },
    {
      workflow: "build_modules",
      title: "Build From Modules",
      description: "Pick pose, outfit, camera, and background.",
    },
    {
      workflow: "batch_photo_dump",
      title: "Create Photo Dump",
      description: "Generate 8-12 related lifestyle images.",
    },
    {
      workflow: "product_ugc",
      title: "Product UGC",
      description: "Upload or attach a product and make ad images.",
    },
    {
      workflow: "free_generate",
      title: "Calibrate Identity",
      description: `Generate test images to lock ${characterName}'s look.`,
    },
  ]

  return (
    <div className="w-full max-w-[760px] text-left">
      <div className="text-center">
        <IconPhoto className="mx-auto size-12 text-[#b8babf]" stroke={1.5} />
        <div className="mt-5 text-[22px] font-bold text-[#333]">
          No images yet
        </div>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <button
            key={`${card.title}-${card.workflow}`}
            className="min-h-28 rounded-[12px] border border-[#e2e4ea] bg-white p-4 text-left shadow-sm transition hover:border-[#ff4f28] hover:shadow-md"
            onClick={() => onSelectWorkflow(card.workflow)}
          >
            <span className="text-[15px] font-bold text-[#202020]">
              {card.title}
            </span>
            <span className="mt-2 block text-[12px] leading-5 font-semibold text-[#77766f]">
              {card.description}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

export function BottomWorkflowControls({
  workflow,
  isEditWorkflow,
  sourceGeneration,
  selectedReferenceAsset,
  selectedOutfitAsset,
  motionVideoUrl,
  selfieTemplate,
  onSelfieTemplateChange,
  breastSize,
  onBreastSizeChange,
  imageGenerateCount,
  onImageGenerateCountChange,
  photoDumpCount,
  onPhotoDumpCountChange,
  slideshowSlides,
  onSlideshowSlidesChange,
  productName,
  onProductNameChange,
  productAudience,
  onProductAudienceChange,
  productAngle,
  onProductAngleChange,
  moduleRecipe,
  onModuleRecipeChange,
  onClearSource,
  onOpenReference,
  onOpenOutfits,
  onOpenMotion,
}: {
  workflow: CharacterWorkflowKey
  isEditWorkflow: boolean
  sourceGeneration: CharacterImageGenerationRecord | null
  selectedReferenceAsset: AssetRecord | null
  selectedOutfitAsset?: AssetRecord
  motionVideoUrl: string
  selfieTemplate: string
  onSelfieTemplateChange: (value: string) => void
  breastSize: string
  onBreastSizeChange: (value: string) => void
  imageGenerateCount: number
  onImageGenerateCountChange: (value: number) => void
  photoDumpCount: number
  onPhotoDumpCountChange: (value: number) => void
  slideshowSlides: number
  onSlideshowSlidesChange: (value: number) => void
  productName: string
  onProductNameChange: (value: string) => void
  productAudience: string
  onProductAudienceChange: (value: string) => void
  productAngle: string
  onProductAngleChange: (value: string) => void
  moduleRecipe: Record<string, string>
  onModuleRecipeChange: (value: Record<string, string>) => void
  onClearSource: () => void
  onOpenReference: () => void
  onOpenOutfits: () => void
  onOpenMotion: () => void
}) {
  return (
    <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1">
      {sourceGeneration?.imageUrl ? (
        <div className="flex items-center gap-2 rounded-[10px] border border-[#ffb199] bg-[#fff4ed] p-1 pr-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- Generated local image URL is returned by the app API. */}
          <img
            src={sourceGeneration.imageUrl}
            alt="Selected edit source"
            className="size-11 rounded-[8px] object-cover"
          />
          <span className="text-[12px] font-bold text-[#ff4f28]">Source</span>
          <button
            type="button"
            className="grid size-6 place-items-center rounded-full text-[#ff4f28] hover:bg-[#ffe1d6]"
            aria-label="Clear selected source image"
            onClick={onClearSource}
          >
            <IconX className="size-4" />
          </button>
        </div>
      ) : (
        isEditWorkflow && (
          <div className="rounded-[10px] border border-[#f04438] bg-[#fff5f5] px-3 py-2 text-[12px] font-bold text-[#b42318]">
            Select a generated image first
          </div>
        )
      )}

      {workflow === "recreate_reference" && (
        <Button
          variant="softControl"
          size="lg"
          className={cn(
            "h-auto min-h-12 gap-2 border-2 p-1 pr-3",
            referenceAssetReady(selectedReferenceAsset)
              ? "border-[#12b76a]"
              : "border-[#f04438]"
          )}
          onClick={onOpenReference}
        >
          {selectedReferenceAsset?.fileUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- Uploaded local reference assets are stored by the app API. */}
              <img
                src={selectedReferenceAsset.fileUrl}
                alt={selectedReferenceAsset.name || "Selected reference"}
                className="size-11 rounded-[8px] object-cover"
              />
              <span>Reference</span>
            </>
          ) : (
            "Reference"
          )}
        </Button>
      )}

      {workflow === "outfit_transfer" && (
        <Button variant="softControl" size="lg" onClick={onOpenOutfits}>
          Outfits
          <span
            className={cn(
              "ml-2 size-2 rounded-full",
              selectedOutfitAsset?.fileUrl ? "bg-[#12b76a]" : "bg-[#f04438]"
            )}
          />
        </Button>
      )}

      {workflow === "motion_control" && (
        <Button variant="softControl" size="lg" onClick={onOpenMotion}>
          Motion ref
          <span
            className={cn(
              "ml-2 size-2 rounded-full",
              motionVideoUrl ? "bg-[#12b76a]" : "bg-[#f04438]"
            )}
          />
        </Button>
      )}

      {workflow === "seedream_bedroom_selfie" && (
        <>
          <label className="flex items-center gap-2 text-[12px] font-bold tracking-wide text-[#77766f] uppercase">
            Preset
            <SelectControl
              value={selfieTemplate}
              onChange={(event) => onSelfieTemplateChange(event.target.value)}
            >
              <option value="barely_awake_oversized_tee">Barely Awake</option>
              <option value="tank_top_flirty_smile">Tank Top</option>
              <option value="messy_bun_glasses">Bun Glasses</option>
              <option value="sheet_pull_soft_smile_bralette">Sheet Pull</option>
            </SelectControl>
          </label>
          <label className="flex items-center gap-2 text-[12px] font-bold tracking-wide text-[#77766f] uppercase">
            Size
            <SelectControl
              value={breastSize}
              onChange={(event) => onBreastSizeChange(event.target.value)}
            >
              {["a cup", "b cup", "c cup", "d cup", "dd cup"].map((size) => (
                <option key={size} value={size}>
                  {size.toUpperCase()}
                </option>
              ))}
            </SelectControl>
          </label>
        </>
      )}

      {workflow === "build_modules" && (
        <>
          <NumberStepper
            label="Images"
            value={imageGenerateCount}
            min={1}
            max={4}
            onChange={onImageGenerateCountChange}
          />
          <InlineModuleControls
            moduleRecipe={moduleRecipe}
            onModuleRecipeChange={onModuleRecipeChange}
          />
        </>
      )}
      {workflow === "recreate_reference" && (
        <NumberStepper
          label="Images"
          value={imageGenerateCount}
          min={1}
          max={4}
          onChange={onImageGenerateCountChange}
        />
      )}
      {workflow === "batch_photo_dump" && (
        <NumberStepper
          label="Images"
          value={photoDumpCount}
          min={1}
          max={12}
          onChange={onPhotoDumpCountChange}
        />
      )}
      {workflow === "tiktok_slideshow" && (
        <NumberStepper
          label="Slides"
          value={slideshowSlides}
          min={2}
          max={10}
          onChange={onSlideshowSlidesChange}
        />
      )}
      {workflow === "product_ugc" && (
        <>
          <NumberStepper
            label="Images"
            value={imageGenerateCount}
            min={1}
            max={5}
            onChange={onImageGenerateCountChange}
          />
          <InlineTextControl
            label="Product"
            value={productName}
            onChange={onProductNameChange}
          />
          <InlineTextControl
            label="Audience"
            value={productAudience}
            onChange={onProductAudienceChange}
          />
          <InlineTextControl
            label="Angle"
            value={productAngle}
            onChange={onProductAngleChange}
          />
        </>
      )}
    </div>
  )
}

function InlineModuleControls({
  moduleRecipe,
  onModuleRecipeChange,
}: {
  moduleRecipe: Record<string, string>
  onModuleRecipeChange: (value: Record<string, string>) => void
}) {
  return (
    <>
      {Object.entries(moduleRecipe)
        .slice(0, 4)
        .map(([key, value]) => (
          <InlineTextControl
            key={key}
            label={key}
            value={value}
            onChange={(nextValue) =>
              onModuleRecipeChange({ ...moduleRecipe, [key]: nextValue })
            }
          />
        ))}
    </>
  )
}

function InlineTextControl({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="flex items-center gap-2 text-[12px] font-bold tracking-wide text-[#77766f] uppercase">
      {label}
      <input
        className="h-9 w-[130px] rounded-[9px] border border-[#dde1e7] px-3 text-[13px] font-semibold text-[#111827] outline-none"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

function NumberStepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}) {
  return (
    <label className="flex items-center gap-2 text-[12px] font-bold tracking-wide text-[#77766f] uppercase">
      {label}
      <input
        className="h-9 w-20 rounded-[9px] border border-[#dde1e7] px-3 text-[13px] font-semibold text-[#111827] outline-none"
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) =>
          onChange(clampNumber(Number(event.target.value), min, max))
        }
      />
    </label>
  )
}

// Legacy right-side workflow panel kept temporarily while the bottom editor migration settles.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function WorkflowSidePanel({
  character,
  workflow,
  onWorkflowChange,
  recreateMode,
  onRecreateModeChange,
  referenceImageUrl,
  onReferenceImageUrlChange,
  motionVideoUrl,
  onMotionVideoUrlChange,
  motionSourceImageUrl,
  onMotionSourceImageUrlChange,
  selfieTemplate,
  onSelfieTemplateChange,
  breastSize,
  onBreastSizeChange,
  clothingImageUrl,
  onClothingImageUrlChange,
  photoDumpCount,
  onPhotoDumpCountChange,
  slideshowSlides,
  onSlideshowSlidesChange,
  productName,
  onProductNameChange,
  productAudience,
  onProductAudienceChange,
  productAngle,
  onProductAngleChange,
  moduleRecipe,
  onModuleRecipeChange,
  selectedAssets,
  attachments,
  onOpenAssets,
  onOpenReference,
  onGenerate,
}: {
  character: CharacterRecord
  workflow: CharacterWorkflowKey
  onWorkflowChange: (workflow: CharacterWorkflowKey) => void
  recreateMode: string
  onRecreateModeChange: (value: string) => void
  referenceImageUrl: string
  onReferenceImageUrlChange: (value: string) => void
  motionVideoUrl: string
  onMotionVideoUrlChange: (value: string) => void
  motionSourceImageUrl: string
  onMotionSourceImageUrlChange: (value: string) => void
  selfieTemplate: string
  onSelfieTemplateChange: (value: string) => void
  breastSize: string
  onBreastSizeChange: (value: string) => void
  clothingImageUrl: string
  onClothingImageUrlChange: (value: string) => void
  photoDumpCount: number
  onPhotoDumpCountChange: (value: number) => void
  slideshowSlides: number
  onSlideshowSlidesChange: (value: number) => void
  productName: string
  onProductNameChange: (value: string) => void
  productAudience: string
  onProductAudienceChange: (value: string) => void
  productAngle: string
  onProductAngleChange: (value: string) => void
  moduleRecipe: Record<string, string>
  onModuleRecipeChange: (value: Record<string, string>) => void
  selectedAssets: AssetRecord[]
  attachments: CharacterPromptAttachment[]
  onOpenAssets: () => void
  onOpenReference: () => void
  onGenerate: () => void
}) {
  const activeWorkflow =
    characterWorkflowOptions.find((option) => option.key === workflow) ??
    characterWorkflowOptions[0]

  return (
    <aside className="hidden h-[calc(100svh-72px)] overflow-y-auto border-l border-[#e4e4df] bg-[#f3f3ee] p-4 lg:block">
      <div className="rounded-[14px] bg-white p-4 shadow-sm">
        <div className="text-[12px] font-bold tracking-wide text-[#9a9a93] uppercase">
          Workflow
        </div>
        <SelectControl
          aria-label="Workflow panel mode"
          className="mt-2 w-full"
          value={workflow}
          onChange={(event) =>
            onWorkflowChange(event.target.value as CharacterWorkflowKey)
          }
        >
          {characterWorkflowOptions.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </SelectControl>
        <p className="mt-3 text-[13px] leading-5 font-semibold text-[#77766f]">
          {activeWorkflow.description}
        </p>
      </div>

      <div className="mt-4 rounded-[14px] bg-white p-4 shadow-sm">
        {workflow === "free_generate" && (
          <FreeGeneratePanel
            character={character}
            attachments={attachments}
            selectedAssets={selectedAssets}
            onOpenAssets={onOpenAssets}
          />
        )}
        {workflow === "recreate_reference" && (
          <RecreateReferencePanel
            recreateMode={recreateMode}
            onRecreateModeChange={onRecreateModeChange}
            referenceImageUrl={referenceImageUrl}
            onReferenceImageUrlChange={onReferenceImageUrlChange}
            onOpenReference={onOpenReference}
          />
        )}
        {workflow === "build_modules" && (
          <BuildModulesPanel
            moduleRecipe={moduleRecipe}
            onModuleRecipeChange={onModuleRecipeChange}
          />
        )}
        {workflow === "batch_photo_dump" && (
          <BatchPhotoDumpPanel
            photoDumpCount={photoDumpCount}
            onPhotoDumpCountChange={onPhotoDumpCountChange}
          />
        )}
        {workflow === "tiktok_slideshow" && (
          <TikTokSlideshowPanel
            slideshowSlides={slideshowSlides}
            onSlideshowSlidesChange={onSlideshowSlidesChange}
          />
        )}
        {workflow === "product_ugc" && (
          <ProductUgcPanel
            productName={productName}
            onProductNameChange={onProductNameChange}
            productAudience={productAudience}
            onProductAudienceChange={onProductAudienceChange}
            productAngle={productAngle}
            onProductAngleChange={onProductAngleChange}
            onOpenAssets={onOpenAssets}
          />
        )}
        {workflow === "animate_image" && <AnimateImagePanel />}
        {workflow === "motion_control" && (
          <MotionControlPanel
            character={character}
            motionVideoUrl={motionVideoUrl}
            onMotionVideoUrlChange={onMotionVideoUrlChange}
            motionSourceImageUrl={motionSourceImageUrl}
            onMotionSourceImageUrlChange={onMotionSourceImageUrlChange}
          />
        )}
        {workflow === "seedream_bedroom_selfie" && (
          <SeedreamSelfiePanel
            selfieTemplate={selfieTemplate}
            onSelfieTemplateChange={onSelfieTemplateChange}
            breastSize={breastSize}
            onBreastSizeChange={onBreastSizeChange}
          />
        )}
        {workflow === "outfit_transfer" && (
          <OutfitTransferPanel
            clothingImageUrl={clothingImageUrl}
            onClothingImageUrlChange={onClothingImageUrlChange}
            onOpenAssets={onOpenAssets}
          />
        )}
        {workflow === "pose_variation_cut_video" && (
          <PoseVariationCutVideoPanel character={character} />
        )}
      </div>

      <Button
        variant="action"
        size="largeAction"
        className="mt-4 w-full"
        onClick={onGenerate}
      >
        Generate
      </Button>
    </aside>
  )
}

function FreeGeneratePanel({
  character,
  attachments,
  selectedAssets,
  onOpenAssets,
}: {
  character: CharacterRecord
  attachments: CharacterPromptAttachment[]
  selectedAssets: AssetRecord[]
  onOpenAssets: () => void
}) {
  return (
    <div className="space-y-4">
      <PanelTitle title="Free Generate" />
      <div className="space-y-2">
        {[
          `Use ${character.name}'s headshot`,
          "Preserve face",
          "Preserve hairstyle",
          "Preserve body/style",
        ].map((label) => (
          <StaticCheckbox key={label} label={label} checked />
        ))}
      </div>
      <PanelSection title="Assets">
        <div className="space-y-2">
          {attachments.map((attachment) => (
            <div
              key={`${attachment.kind}-${attachment.url}`}
              className="flex items-center justify-between rounded-[8px] bg-[#f6f6f2] px-3 py-2 text-[12px] font-bold text-[#555]"
            >
              <span className="truncate">{attachment.label}</span>
              <span className="ml-2 shrink-0 uppercase">{attachment.kind}</span>
            </div>
          ))}
          <button
            className="h-9 w-full rounded-[8px] border border-dashed border-[#c8c9c2] text-[12px] font-bold text-[#77766f]"
            onClick={onOpenAssets}
          >
            {selectedAssets.length > 0
              ? "Manage assets"
              : "Add optional assets"}
          </button>
        </div>
      </PanelSection>
      <PanelSection title="Prompt strength">
        <div className="space-y-2 text-[12px] font-bold text-[#555]">
          <StrengthRow label="Character" value="High" />
          <StrengthRow label="User prompt" value="Medium" />
          <StrengthRow label="Reference" value="None" />
        </div>
      </PanelSection>
    </div>
  )
}

function RecreateReferencePanel({
  recreateMode,
  onRecreateModeChange,
  referenceImageUrl,
  onReferenceImageUrlChange,
  onOpenReference,
}: {
  recreateMode: string
  onRecreateModeChange: (value: string) => void
  referenceImageUrl: string
  onReferenceImageUrlChange: (value: string) => void
  onOpenReference: () => void
}) {
  return (
    <div className="space-y-4">
      <PanelTitle title="Recreate Reference" />
      <button
        className="grid min-h-28 w-full place-items-center rounded-[12px] border border-dashed border-[#c8c9c2] bg-[#f7f7f3] p-4 text-center text-[13px] font-bold text-[#77766f]"
        onClick={onOpenReference}
      >
        Drop IG/TikTok screenshot here
      </button>
      <TextField
        label="Reference image URL"
        value={referenceImageUrl}
        onChange={onReferenceImageUrlChange}
      />
      <div className="rounded-[10px] bg-[#fff7ed] p-3 text-[12px] leading-5 font-semibold text-[#9a5a1f]">
        Reference is used for pose, composition, camera, outfit vibe, and
        background only. Identity stays locked to the selected character.
      </div>
      <PanelSection title="Analyze result">
        <dl className="space-y-2 text-[12px] font-semibold text-[#555]">
          <InfoRow label="Photo type" value="Mirror selfie" />
          <InfoRow label="Pose" value="Standing angled" />
          <InfoRow label="Camera" value="Eye-level phone mirror" />
          <InfoRow label="Background" value="Bedroom" />
          <InfoRow label="Outfit vibe" value="Casual UGC styling" />
        </dl>
      </PanelSection>
      <label className="block text-[12px] font-bold text-[#667085]">
        Recreation mode
        <SelectControl
          className="mt-2 w-full"
          value={recreateMode}
          onChange={(event) => onRecreateModeChange(event.target.value)}
        >
          {[
            "Pose only",
            "Pose + camera",
            "Pose + background",
            "Full style recreation",
          ].map((mode) => (
            <option key={mode} value={mode}>
              {mode}
            </option>
          ))}
        </SelectControl>
      </label>
      <PanelSection title="Copy strength">
        <RangeReadout label="Pose" value={80} />
        <RangeReadout label="Camera" value={70} />
        <RangeReadout label="Background" value={60} />
        <RangeReadout label="Outfit vibe" value={50} />
      </PanelSection>
    </div>
  )
}

function MotionControlPanel({
  character,
  motionVideoUrl,
  onMotionVideoUrlChange,
  motionSourceImageUrl,
  onMotionSourceImageUrlChange,
}: {
  character: CharacterRecord
  motionVideoUrl: string
  onMotionVideoUrlChange: (value: string) => void
  motionSourceImageUrl: string
  onMotionSourceImageUrlChange: (value: string) => void
}) {
  return (
    <div className="space-y-4">
      <PanelTitle title="Motion Control" />
      <div className="rounded-[10px] bg-[#f7f7f3] p-3 text-[12px] leading-5 font-semibold text-[#77766f]">
        Uses Kling 3 motion-control. Character orientation is locked to the
        image; movement and facial expressions come from the reference video.
      </div>
      <TextField
        label="Motion reference video URL"
        value={motionVideoUrl}
        onChange={onMotionVideoUrlChange}
      />
      <TextField
        label="Source character image URL"
        value={motionSourceImageUrl}
        onChange={onMotionSourceImageUrlChange}
      />
      {!motionSourceImageUrl && (
        <div className="rounded-[8px] bg-[#f2f4f7] px-3 py-2 text-[12px] font-bold text-[#667085]">
          Defaults to {character.name}&apos;s profile image.
        </div>
      )}
    </div>
  )
}

function SeedreamSelfiePanel({
  selfieTemplate,
  onSelfieTemplateChange,
  breastSize,
  onBreastSizeChange,
}: {
  selfieTemplate: string
  onSelfieTemplateChange: (value: string) => void
  breastSize: string
  onBreastSizeChange: (value: string) => void
}) {
  return (
    <div className="space-y-4">
      <PanelTitle title="Seedream Selfie" />
      <label className="block text-[12px] font-bold text-[#667085]">
        Prompt preset
        <SelectControl
          className="mt-2 w-full"
          value={selfieTemplate}
          onChange={(event) => onSelfieTemplateChange(event.target.value)}
        >
          <option value="barely_awake_oversized_tee">
            Barely Awake Oversized Tee
          </option>
          <option value="tank_top_flirty_smile">Tank Top Flirty Smile</option>
          <option value="messy_bun_glasses">Messy Bun & Glasses</option>
          <option value="sheet_pull_soft_smile_bralette">
            Sheet Pull Soft Smile Bralette
          </option>
        </SelectControl>
      </label>
      <TextField
        label="Breast size setting"
        value={breastSize}
        onChange={onBreastSizeChange}
      />
      <div className="rounded-[10px] bg-[#fff7ed] p-3 text-[12px] leading-5 font-semibold text-[#9a5a1f]">
        Generated prompt explicitly keeps this as an adult woman and preserves
        the attached character identity.
      </div>
    </div>
  )
}

function OutfitTransferPanel({
  clothingImageUrl,
  onClothingImageUrlChange,
  onOpenAssets,
}: {
  clothingImageUrl: string
  onClothingImageUrlChange: (value: string) => void
  onOpenAssets: () => void
}) {
  return (
    <div className="space-y-4">
      <PanelTitle title="Outfit Transfer" />
      <TextField
        label="Clothing reference URL"
        value={clothingImageUrl}
        onChange={onClothingImageUrlChange}
      />
      <button
        className="h-9 w-full rounded-[8px] border border-dashed border-[#c8c9c2] text-[12px] font-bold text-[#77766f]"
        onClick={onOpenAssets}
      >
        Choose from outfits
      </button>
      <div className="rounded-[10px] bg-[#f7f7f3] p-3 text-[12px] leading-5 font-semibold text-[#77766f]">
        Uses image 1 as the influencer and image 2 as the clothing reference.
      </div>
    </div>
  )
}

function PoseVariationCutVideoPanel({
  character,
}: {
  character: CharacterRecord
}) {
  return (
    <div className="space-y-4">
      <PanelTitle title="Pose Cut Video" />
      <div className="rounded-[10px] bg-[#f7f7f3] p-3 text-[12px] leading-5 font-semibold text-[#77766f]">
        Starts from {character.name}&apos;s profile image, creates a stronger
        pose variation as the end frame, animates the two frames with Kling 2.5,
        then adds random micro cuts and a random song from the music folder.
      </div>
      <PanelSection title="Output">
        <dl className="space-y-2 text-[12px] font-semibold text-[#555]">
          <InfoRow label="End frame" value="Nano Banana Pro image edit" />
          <InfoRow label="Video" value="Kling 2.5 start/end frame" />
          <InfoRow label="Cuts" value="0.2-0.3s random micro cuts" />
          <InfoRow label="Music" value="Random TikTok trend audio file" />
        </dl>
      </PanelSection>
    </div>
  )
}

function BuildModulesPanel({
  moduleRecipe,
  onModuleRecipeChange,
}: {
  moduleRecipe: Record<string, string>
  onModuleRecipeChange: (value: Record<string, string>) => void
}) {
  const options: Record<string, string[]> = {
    action: ["Mirror selfie", "Walking shot", "Product hold", "Desk setup"],
    pose: ["Standing mirror selfie", "Seated casual pose", "Side angle"],
    expression: ["Soft pout", "Natural smile", "Neutral confident"],
    hair: ["Long loose waves", "Slick bun", "Messy ponytail"],
    top: ["Cropped tee", "Oversized hoodie", "Fitted tank"],
    bottom: ["Denim skirt", "Relaxed jeans", "Athleisure shorts"],
    device: ["Clear phone case", "No phone", "Compact camera"],
    photography: [
      "Casual smartphone mirror selfie",
      "Candid iPhone photo",
      "Flash photo",
    ],
    background: ["Minimal bedroom", "Bright kitchen", "Street corner"],
  }

  return (
    <div className="space-y-3">
      <PanelTitle title="Build From Modules" />
      {Object.entries(options).map(([key, values]) => (
        <label
          key={key}
          className="block text-[12px] font-bold text-[#667085] capitalize"
        >
          {key}
          <SelectControl
            className="mt-1 w-full"
            value={moduleRecipe[key] ?? values[0]}
            onChange={(event) =>
              onModuleRecipeChange({
                ...moduleRecipe,
                [key]: event.target.value,
              })
            }
          >
            {values.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </SelectControl>
        </label>
      ))}
    </div>
  )
}

function BatchPhotoDumpPanel({
  photoDumpCount,
  onPhotoDumpCountChange,
}: {
  photoDumpCount: number
  onPhotoDumpCountChange: (value: number) => void
}) {
  return (
    <div className="space-y-4">
      <PanelTitle title="Photo Dump" />
      <NumberField
        label="Number of images"
        value={photoDumpCount}
        min={1}
        max={12}
        onChange={onPhotoDumpCountChange}
      />
      <PanelSection title="Vary">
        {["Pose", "Outfit", "Background", "Camera angle"].map((label) => (
          <StaticCheckbox key={label} label={label} checked />
        ))}
        {["Hairstyle", "Makeup"].map((label) => (
          <StaticCheckbox key={label} label={label} />
        ))}
      </PanelSection>
      <PanelSection title="Keep consistent">
        {["Face", "Body", "Phone case", "Skin texture"].map((label) => (
          <StaticCheckbox key={label} label={label} checked />
        ))}
      </PanelSection>
    </div>
  )
}

function TikTokSlideshowPanel({
  slideshowSlides,
  onSlideshowSlidesChange,
}: {
  slideshowSlides: number
  onSlideshowSlidesChange: (value: number) => void
}) {
  return (
    <div className="space-y-4">
      <PanelTitle title="TikTok Slideshow" />
      <label className="block text-[12px] font-bold text-[#667085]">
        Slideshow type
        <SelectControl className="mt-2 w-full" defaultValue="Lifestyle">
          {["Lifestyle", "UGC", "Product", "Story"].map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </SelectControl>
      </label>
      <NumberField
        label="Number of slides"
        value={slideshowSlides}
        min={2}
        max={10}
        onChange={onSlideshowSlidesChange}
      />
      <PanelSection title="Generate">
        {["Images", "Slide captions", "Cover hook"].map((label) => (
          <StaticCheckbox key={label} label={label} checked />
        ))}
      </PanelSection>
    </div>
  )
}

function ProductUgcPanel({
  productName,
  onProductNameChange,
  productAudience,
  onProductAudienceChange,
  productAngle,
  onProductAngleChange,
  onOpenAssets,
}: {
  productName: string
  onProductNameChange: (value: string) => void
  productAudience: string
  onProductAudienceChange: (value: string) => void
  productAngle: string
  onProductAngleChange: (value: string) => void
  onOpenAssets: () => void
}) {
  return (
    <div className="space-y-4">
      <PanelTitle title="Product UGC" />
      <button
        className="grid min-h-20 w-full place-items-center rounded-[12px] border border-dashed border-[#c8c9c2] bg-[#f7f7f3] p-4 text-center text-[13px] font-bold text-[#77766f]"
        onClick={onOpenAssets}
      >
        Upload or select product image
      </button>
      <TextField
        label="Name"
        value={productName}
        onChange={onProductNameChange}
      />
      <TextField
        label="Audience"
        value={productAudience}
        onChange={onProductAudienceChange}
      />
      <TextField
        label="Angle"
        value={productAngle}
        onChange={onProductAngleChange}
      />
      <PanelSection title="Creative pack">
        {[
          "Hook image",
          "Holding product",
          "Before/after",
          "Reaction selfie",
          "Result shot",
        ].map((label) => (
          <StaticCheckbox key={label} label={label} checked />
        ))}
      </PanelSection>
    </div>
  )
}

function AnimateImagePanel() {
  return (
    <div className="space-y-4">
      <PanelTitle title="Animate Image" />
      <div className="rounded-[10px] bg-[#f7f7f3] p-3 text-[12px] leading-5 font-semibold text-[#77766f]">
        Generate or select an image first, then open it to use Edit, Upscale,
        Variations, or Animate. The image editor stores video metadata beside
        the selected image.
      </div>
      <PanelSection title="Motion preset">
        <StrengthRow label="Preset" value="Subtle selfie movement" />
        <StaticCheckbox label="Natural blinking" checked />
        <StaticCheckbox label="Slight head tilt" checked />
        <StaticCheckbox label="Handheld phone motion" checked />
      </PanelSection>
    </div>
  )
}

function PanelTitle({ title }: { title: string }) {
  return <h2 className="text-[18px] font-bold text-[#202020]">{title}</h2>
}

function PanelSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section>
      <div className="mb-2 text-[12px] font-bold tracking-wide text-[#9a9a93] uppercase">
        {title}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  )
}

function StaticCheckbox({
  label,
  checked = false,
}: {
  label: string
  checked?: boolean
}) {
  return (
    <label className="flex items-center gap-2 text-[12px] font-bold text-[#555]">
      <input type="checkbox" checked={checked} readOnly />
      {label}
    </label>
  )
}

function StrengthRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <span className="rounded-full bg-[#f2f4f7] px-2 py-0.5 text-[#667085]">
        {value}
      </span>
    </div>
  )
}

export function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[92px_1fr] gap-2">
      <dt className="text-[#9a9a93]">{label}</dt>
      <dd className="text-[#333]">{value}</dd>
    </div>
  )
}

function RangeReadout({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[12px] font-bold text-[#555]">
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[#ecece8]">
        <div
          className="h-full rounded-full bg-app-action"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  )
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}) {
  return (
    <label className="block text-[12px] font-bold text-[#667085]">
      {label}
      <input
        className="mt-2 h-10 w-full rounded-[10px] border border-[#dde1e7] px-3 text-[14px] font-semibold text-[#111827] outline-none"
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) =>
          onChange(clampNumber(Number(event.target.value), min, max))
        }
      />
    </label>
  )
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="block text-[12px] font-bold text-[#667085]">
      {label}
      <input
        className="mt-2 h-10 w-full rounded-[10px] border border-[#dde1e7] px-3 text-[14px] font-semibold text-[#111827] outline-none"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}
