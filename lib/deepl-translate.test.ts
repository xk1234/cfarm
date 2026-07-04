import { afterEach, describe, expect, it, vi } from "vitest"

import { translateTextsWithDeepL } from "@/lib/deepl-translate"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("DeepL translation", () => {
  it("translates text batches with the configured target language", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({
        translations: [
          { detected_source_language: "EN", text: "hola" },
          { detected_source_language: "EN", text: "mundo" },
        ],
      }), { status: 200 })
    )
    vi.stubGlobal("fetch", fetchMock)

    const result = await translateTextsWithDeepL({
      apiKey: "deepl-key",
      targetLanguage: "Spanish",
      texts: ["hello", "world"],
    })

    expect(result).toEqual(["hola", "mundo"])
    const [url, request] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("https://api-free.deepl.com/v2/translate")
    expect(request.headers).toMatchObject({
      Authorization: "DeepL-Auth-Key deepl-key",
      "Content-Type": "application/json",
    })
    expect(JSON.parse(request.body as string)).toEqual({
      text: ["hello", "world"],
      target_lang: "ES",
    })
  })
})
