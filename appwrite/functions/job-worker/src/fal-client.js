// Generated from lib/fal-client.ts. Do not edit by hand.
export class FalProviderError extends Error {
    retryable;
    status;
    constructor(message, retryable, status) {
        super(message);
        this.retryable = retryable;
        this.status = status;
        this.name = "FalProviderError";
    }
}
const FAL_QUEUE = "https://queue.fal.run";
export async function falSubmitAndWait(input) {
    if (!input.apiKey.trim())
        throw new FalProviderError("Missing FAL_KEY", false);
    const fetchImpl = input.fetchImpl ?? fetch;
    const endpoint = input.endpoint.replace(/^\/+|\/+$/g, "");
    const headers = { Authorization: `Key ${input.apiKey}`, "Content-Type": "application/json" };
    const submitted = await falJson(fetchImpl, `${FAL_QUEUE}/${endpoint}`, {
        method: "POST", headers, body: JSON.stringify(input.input),
    });
    const requestId = submitted.request_id || input.requestId;
    if (!requestId)
        throw new FalProviderError("FAL did not return a request id", true);
    const deadline = Date.now() + (input.timeoutMs ?? 600_000);
    for (;;) {
        if (Date.now() >= deadline)
            throw new FalProviderError("FAL polling timed out", true);
        const status = await falJson(fetchImpl, `${FAL_QUEUE}/${endpoint}/requests/${encodeURIComponent(requestId)}/status`, { headers });
        if (status.status === "COMPLETED")
            break;
        if (status.status === "FAILED")
            throw new FalProviderError(status.error || "FAL request failed", false);
        await delay(input.pollDelayMs ?? 2_000);
    }
    return falJson(fetchImpl, `${FAL_QUEUE}/${endpoint}/requests/${encodeURIComponent(requestId)}`, { headers });
}
export async function generateFalImage(input) {
    return normalizeFalAsset(await falSubmitAndWait(input), "image");
}
export async function generateFalVideo(input) {
    return normalizeFalAsset(await falSubmitAndWait(input), "video");
}
export async function lipSyncFalVideo(input) {
    return generateFalVideo(input);
}
function normalizeFalAsset(payload, kind) {
    const candidate = kind === "image" && Array.isArray(payload.images) ? payload.images[0] : payload.video ?? payload.output;
    const record = candidate && typeof candidate === "object" ? candidate : payload;
    const url = typeof record.url === "string" ? record.url : "";
    if (!/^https:\/\//i.test(url))
        throw new FalProviderError(`FAL ${kind} response is missing a secure asset URL`, false);
    return { url, contentType: typeof record.content_type === "string" ? record.content_type : undefined, width: numeric(record.width), height: numeric(record.height), durationSeconds: numeric(record.duration) };
}
async function falJson(fetchImpl, url, init) {
    let response;
    try {
        response = await fetchImpl(url, init);
    }
    catch (cause) {
        throw new FalProviderError(cause instanceof Error ? cause.message : "FAL network error", true);
    }
    const payload = await response.json().catch(() => null);
    if (!response.ok)
        throw new FalProviderError(String(payload?.detail ?? payload?.message ?? `FAL request failed (${response.status})`), response.status === 408 || response.status === 409 || response.status === 425 || response.status === 429 || response.status >= 500, response.status);
    return payload;
}
const numeric = (value) => typeof value === "number" && Number.isFinite(value) ? value : undefined;
const delay = (ms) => ms <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms));
