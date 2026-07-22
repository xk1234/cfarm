// Generated from lib/elevenlabs-tts.ts. Do not edit by hand.
export async function synthesizeElevenLabsSpeech(input) {
    if (!input.apiKey.trim())
        throw new Error("Missing ELEVENLABS_API_KEY");
    if (!input.voiceId.trim())
        throw new Error("ElevenLabs voiceId is required");
    const endpoint = input.endpoint ?? "https://api.elevenlabs.io/v1/text-to-speech";
    const response = await (input.fetchImpl ?? fetch)(`${endpoint}/${encodeURIComponent(input.voiceId)}/with-timestamps?output_format=${encodeURIComponent(input.outputFormat ?? "mp3_44100_128")}`, {
        method: "POST",
        headers: { "xi-api-key": input.apiKey, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ text: input.text, model_id: input.modelId, voice_settings: input.voiceSettings }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok)
        throw new Error(String(payload?.detail ?? `ElevenLabs request failed (${response.status})`));
    const audioBase64 = typeof payload?.audio_base64 === "string" ? payload.audio_base64 : "";
    if (!audioBase64)
        throw new Error("ElevenLabs response did not include audio");
    const alignment = (payload?.normalized_alignment ?? payload?.alignment);
    const words = alignmentToWords(alignment);
    return { audio: Uint8Array.from(Buffer.from(audioBase64, "base64")), contentType: "audio/mpeg", durationMs: words.at(-1)?.endMs, words };
}
export function alignmentToWords(alignment) {
    const chars = Array.isArray(alignment?.characters) ? alignment.characters.map(String) : [];
    const starts = Array.isArray(alignment?.character_start_times_seconds) ? alignment.character_start_times_seconds.map(Number) : [];
    const ends = Array.isArray(alignment?.character_end_times_seconds) ? alignment.character_end_times_seconds.map(Number) : [];
    const out = [];
    let text = "", start = 0, end = 0;
    const flush = () => { if (text)
        out.push({ word: text, startMs: Math.round(start * 1000), endMs: Math.round(end * 1000) }); text = ""; };
    chars.forEach((char, index) => {
        if (/\s/.test(char)) {
            flush();
            return;
        }
        if (!text)
            start = Number.isFinite(starts[index]) ? starts[index] : 0;
        text += char;
        end = Number.isFinite(ends[index]) ? ends[index] : start;
    });
    flush();
    return out;
}
