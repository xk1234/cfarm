// Generated from lib/http.ts. Do not edit by hand.
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_BODY_SNIPPET_LENGTH = 300;
export async function fetchWithTimeout(url, init, { timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = fetch } = {}) {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signal = init?.signal
        ? AbortSignal.any([init.signal, timeoutSignal])
        : timeoutSignal;
    return fetchImpl(url, {
        ...init,
        signal,
    });
}
export async function fetchJson(url, init, options = {}) {
    const response = await fetchWithTimeout(url, init, options);
    const text = await response.text().catch(() => "");
    let payload;
    try {
        payload = JSON.parse(text);
    }
    catch {
        if (!response.ok) {
            throw buildHttpError(response, text, options, null);
        }
        const snippet = truncateBodySnippet(text, options.bodySnippetLength ?? DEFAULT_BODY_SNIPPET_LENGTH);
        throw new Error(`Expected JSON response from ${String(url)} but could not parse body${snippet ? `: ${snippet}` : ""}`);
    }
    if (!response.ok) {
        throw buildHttpError(response, text, options, payload);
    }
    return payload;
}
function buildHttpError(response, text, options, payload) {
    const customMessage = options.errorMessage?.(response, payload);
    if (customMessage) {
        return new Error(customMessage);
    }
    const statusText = response.statusText ? ` ${response.statusText}` : "";
    const snippet = truncateBodySnippet(text, options.bodySnippetLength ?? DEFAULT_BODY_SNIPPET_LENGTH);
    return new Error(`HTTP request failed with ${response.status}${statusText}${snippet ? `: ${snippet}` : ""}`);
}
function truncateBodySnippet(text, maxLength) {
    const normalized = text.replace(/\s+/g, " ").trim();
    if (!normalized) {
        return "";
    }
    if (normalized.length <= maxLength) {
        return normalized;
    }
    return `${normalized.slice(0, Math.max(0, maxLength))}...`;
}
