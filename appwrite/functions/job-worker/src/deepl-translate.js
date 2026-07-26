// Generated from lib/deepl-translate.ts. Do not edit by hand.
export { automationLanguageOptions, deeplTargetLanguage, } from "./slideshow-publishing-config.js";
import { deeplTargetLanguage } from "./slideshow-publishing-config.js";
import { fetchJson } from "./http.js";
export async function translateTextsWithDeepL(input) {
    const targetLang = deeplTargetLanguage(input.targetLanguage);
    const texts = input.texts.map((text) => text.trim());
    if (!targetLang || texts.length === 0) {
        return input.texts;
    }
    const payload = await fetchJson("https://api.deepl.com/v2/translate", {
        method: "POST",
        headers: {
            Authorization: `DeepL-Auth-Key ${input.apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            text: texts,
            target_lang: targetLang,
        }),
    }, {
        fetchImpl: input.fetchImpl,
        timeoutMs: 30_000,
        errorMessage: (_response, payload) => typeof payload === "object" &&
            payload !== null &&
            "message" in payload &&
            typeof payload.message === "string"
            ? payload.message
            : "DeepL translation failed",
    });
    return input.texts.map((original, index) => payload.translations?.[index]?.text?.trim() || original);
}
