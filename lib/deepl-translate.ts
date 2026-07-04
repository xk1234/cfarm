export const automationLanguageOptions = [
  "English",
  "Chinese",
  "Malay",
  "Indian",
  "Spanish",
] as const

export type AutomationLanguage = typeof automationLanguageOptions[number]

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
  apiUrl?: string
  fetchImpl?: typeof fetch
}) {
  const targetLang = deeplTargetLanguage(input.targetLanguage)
  const texts = input.texts.map((text) => text.trim())
  if (!targetLang || texts.length === 0) {
    return input.texts
  }

  const fetchImpl = input.fetchImpl ?? fetch
  const response = await fetchImpl(input.apiUrl || "https://api-free.deepl.com/v2/translate", {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: texts,
      target_lang: targetLang,
    }),
  })
  const payload = await response.json().catch(() => ({})) as DeepLTranslateResponse
  if (!response.ok) {
    throw new Error(payload.message || "DeepL translation failed")
  }

  return input.texts.map((original, index) =>
    payload.translations?.[index]?.text?.trim() || original
  )
}

export function deeplTargetLanguage(language: string) {
  switch (language.trim().toLowerCase()) {
    case "chinese":
      return "ZH-HANS"
    case "malay":
      return "MS"
    case "indian":
    case "hindi":
      return "HI"
    case "spanish":
      return "ES"
    case "english":
    default:
      return null
  }
}
