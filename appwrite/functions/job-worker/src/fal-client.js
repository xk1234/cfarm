// Generated from lib/fal-client.ts. Do not edit by hand.
import { recordProviderRequest } from "./provider-request-trace.js";
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
    const requestId = input.requestId || (await falCreateTask({ ...input, fetchImpl }));
    if (!requestId)
        throw new FalProviderError("FAL did not return a request id", true);
    const deadline = Date.now() + (input.timeoutMs ?? 600_000);
    for (;;) {
        if (Date.now() >= deadline)
            throw new FalProviderError("FAL polling timed out", true);
        const status = await falGetTaskStatus({
            endpoint,
            requestId,
            apiKey: input.apiKey,
            fetchImpl,
        });
        if (status.status === "COMPLETED")
            break;
        if (status.status === "FAILED")
            throw new FalProviderError(status.error || "FAL request failed", false);
        await delay(input.pollDelayMs ?? 2_000);
    }
    return falGetTaskResult({
        endpoint,
        requestId,
        apiKey: input.apiKey,
        fetchImpl,
    });
}
export async function falCreateTask(input) {
    const endpoint = input.endpoint.replace(/^\/+|\/+$/g, "");
    recordProviderRequest({
        provider: "fal.ai",
        operation: `queue.submit:${endpoint}`,
        model: endpoint,
        request: { input: input.input },
    });
    const submitted = await falJson(input.fetchImpl ?? fetch, `${FAL_QUEUE}/${endpoint}`, {
        method: "POST",
        headers: {
            Authorization: `Key ${input.apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(input.input),
    });
    if (!submitted.request_id) {
        throw new FalProviderError("FAL did not return a request id", true);
    }
    return submitted.request_id;
}
export async function falGetTaskStatus(input) {
    const endpoint = input.endpoint.replace(/^\/+|\/+$/g, "");
    return falJson(input.fetchImpl ?? fetch, `${FAL_QUEUE}/${endpoint}/requests/${encodeURIComponent(input.requestId)}/status`, { headers: { Authorization: `Key ${input.apiKey}` } });
}
export async function falGetTaskResult(input) {
    const endpoint = input.endpoint.replace(/^\/+|\/+$/g, "");
    return falJson(input.fetchImpl ?? fetch, `${FAL_QUEUE}/${endpoint}/requests/${encodeURIComponent(input.requestId)}`, { headers: { Authorization: `Key ${input.apiKey}` } });
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
export function normalizeFalAsset(payload, kind) {
    const candidate = kind === "image" && Array.isArray(payload.images)
        ? payload.images[0]
        : (payload.video ?? payload.output);
    const record = candidate && typeof candidate === "object"
        ? candidate
        : payload;
    const url = typeof record.url === "string" ? record.url : "";
    if (!/^https:\/\//i.test(url))
        throw new FalProviderError(`FAL ${kind} response is missing a secure asset URL`, false);
    return {
        url,
        contentType: typeof record.content_type === "string" ? record.content_type : undefined,
        width: numeric(record.width),
        height: numeric(record.height),
        durationSeconds: numeric(record.duration),
    };
}
async function falJson(fetchImpl, url, init) {
    let response;
    try {
        response = await fetchImpl(url, init);
    }
    catch (cause) {
        throw new FalProviderError(cause instanceof Error ? cause.message : "FAL network error", true);
    }
    const payload = (await response.json().catch(() => null));
    if (!response.ok)
        throw new FalProviderError([
            `FAL request failed (${response.status})`,
            payload?.detail ? String(payload.detail) : "",
            payload?.message ? String(payload.message) : "",
            // A body with neither field still says more than a bare status.
            !payload?.detail && !payload?.message && payload
                ? `body=${JSON.stringify(payload).slice(0, 300)}`
                : "",
        ]
            .filter(Boolean)
            .join(" | "), response.status === 408 ||
            response.status === 409 ||
            response.status === 425 ||
            response.status === 429 ||
            response.status >= 500, response.status);
    return payload;
}
const numeric = (value) => typeof value === "number" && Number.isFinite(value) ? value : undefined;
const delay = (ms) => ms <= 0
    ? Promise.resolve()
    : new Promise((resolve) => setTimeout(resolve, ms));
