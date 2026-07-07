export {
  automationLanguageOptions,
  deeplTargetLanguage,
  type AutomationLanguage,
} from "@/lib/slideshow-publishing-config"

import { deeplTargetLanguage } from "@/lib/slideshow-publishing-config"
import { fetchJson } from "@/lib/http"

type DeepLTranslateResponse = {
  translations?: {
    text?: string
  }[]
  message?: string
}

export async function translateTextsWithDeepL(input: {
  apiKey: string
  targetLanguage: string
  texts: string[]
  fetchImpl?: typeof fetch
}) {
  const targetLang = deeplTargetLanguage(input.targetLanguage)
  const texts = input.texts.map((text) => text.trim())
  if (!targetLang || texts.length === 0) {
    return input.texts
  }

  const payload = await fetchJson<DeepLTranslateResponse>(
    "https://api.deepl.com/v2/translate",
    {
      method: "POST",
      headers: {
        Authorization: `DeepL-Auth-Key ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: texts,
        target_lang: targetLang,
      }),
    },
    {
      fetchImpl: input.fetchImpl,
      timeoutMs: 30_000,
      errorMessage: (_response, payload) =>
        typeof payload === "object" &&
        payload !== null &&
        "message" in payload &&
        typeof payload.message === "string"
          ? payload.message
          : "DeepL translation failed",
    }
  )

  return input.texts.map(
    (original, index) => payload.translations?.[index]?.text?.trim() || original
  )
}
