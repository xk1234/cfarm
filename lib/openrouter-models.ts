import { clean } from "@/lib/guards"
import { featuredOpenRouterModelIds } from "@/lib/realfarm-generation-model-registry"

export type OpenRouterModelSummary = {
  id: string
  name: string
  contextLength: number | null
  promptPrice: string
  completionPrice: string
  supportsResponseFormat: boolean
  supportsStructuredOutputs: boolean
}

type OpenRouterModelRecord = {
  id?: unknown
  name?: unknown
  context_length?: unknown
  architecture?: {
    input_modalities?: unknown
    output_modalities?: unknown
  }
  pricing?: {
    prompt?: unknown
    completion?: unknown
  }
  supported_parameters?: unknown
}

export function filterOpenRouterTextStructuredModels(
  models: unknown[]
): OpenRouterModelSummary[] {
  return models
    .filter(isOpenRouterModelRecord)
    .filter((model) => clean(model.id))
    .filter((model) =>
      hasModality(model.architecture?.input_modalities, "text")
    )
    .filter((model) => outputTextOnly(model.architecture?.output_modalities))
    .map((model) => {
      const supportedParameters = stringArray(model.supported_parameters)
      return {
        id: clean(model.id),
        name: clean(model.name) || clean(model.id),
        contextLength: numberOrNull(model.context_length),
        promptPrice: clean(model.pricing?.prompt),
        completionPrice: clean(model.pricing?.completion),
        supportsResponseFormat: supportedParameters.includes("response_format"),
        supportsStructuredOutputs:
          supportedParameters.includes("structured_outputs"),
      }
    })
    .filter(
      (model) => model.supportsResponseFormat || model.supportsStructuredOutputs
    )
    .sort(sortModelSummaries)
    .filter(limitModelsPerProvider())
    .slice(0, 10)
}

function sortModelSummaries(
  left: OpenRouterModelSummary,
  right: OpenRouterModelSummary
) {
  const leftRank = featuredRank(left.id)
  const rightRank = featuredRank(right.id)
  if (leftRank !== rightRank) {
    return leftRank - rightRank
  }
  return left.name.localeCompare(right.name)
}

function featuredRank(id: string) {
  const index = featuredModelIds.indexOf(id)
  return index === -1 ? featuredModelIds.length : index
}

function limitModelsPerProvider() {
  const counts = new Map<string, number>()

  return (model: OpenRouterModelSummary) => {
    const provider = model.id.split("/")[0].replace(/^~/, "")
    const count = counts.get(provider) ?? 0
    if (count >= 2) {
      return false
    }
    counts.set(provider, count + 1)
    return true
  }
}

function outputTextOnly(value: unknown) {
  const modalities = stringArray(value)
  return modalities.length === 1 && modalities[0] === "text"
}

function hasModality(value: unknown, modality: string) {
  return stringArray(value).includes(modality)
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : []
}

function isOpenRouterModelRecord(
  value: unknown
): value is OpenRouterModelRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}


export const featuredModelIds = [...featuredOpenRouterModelIds]
