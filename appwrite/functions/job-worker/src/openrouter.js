// Generated from lib/openrouter.ts. Do not edit by hand.
// Shared OpenRouter chat-completions client (audit V5). Centralizes the
// endpoint, auth header, request/response plumbing that was inlined across
// several route handlers. Each caller supplies its model/messages/format and
// optional extra headers, and reads what it needs from `payload`.
import { clean, isRecord } from "./guards.js";
import { openRouterOperationName, tracedOpenRouterFetch, } from "./langfuse-openrouter.js";
import { recordProviderRequest } from "./provider-request-trace.js";
const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
/**
 * Anthropic's structured-output compiler rejects several JSON Schema keywords
 * outright, and any one of them fails the whole request for every provider
 * routed to Anthropic (including via Bedrock):
 *   - `minItems` may only be 0 or 1
 *   - `maxItems` is unsupported
 *   - `minimum` / `maximum` are unsupported on numeric types
 *   - large `enum` arrays can make the compiled schema too complex
 * Strip them at the request boundary so callers can keep expressing intent in
 * the schema, and rely on the prompt plus post-generation validation to enforce
 * the real bounds.
 */
export function sanitizeStructuredSchema(schema) {
    if (Array.isArray(schema)) {
        return schema.map((entry) => sanitizeStructuredSchema(entry));
    }
    if (!schema || typeof schema !== "object")
        return schema;
    const next = {};
    for (const [key, value] of Object.entries(schema)) {
        if (key === "enum" && Array.isArray(value))
            continue;
        if (key === "minItems" && typeof value === "number" && value > 1) {
            next[key] = 1;
            continue;
        }
        if (key === "maxItems" && typeof value === "number")
            continue;
        if ((key === "minimum" || key === "maximum") && typeof value === "number") {
            continue;
        }
        next[key] = sanitizeStructuredSchema(value);
    }
    return next;
}
export class OpenRouterRequestError extends Error {
    status;
    code;
    retryable;
    constructor(input) {
        super(input.message, { cause: input.cause });
        this.name = "OpenRouterRequestError";
        this.status = input.status;
        this.code = input.code;
        this.retryable = input.retryable;
    }
}
export function getOpenRouterApiKey() {
    return clean(process.env.OPENROUTER_API_KEY);
}
export async function openRouterChatCompletion(input) {
    const fetchImpl = input.fetchImpl ?? fetch;
    const requestBody = {
        model: input.model,
        messages: input.messages,
        ...(input.responseFormat ? { response_format: input.responseFormat } : {}),
        ...(input.maxTokens ? { max_tokens: input.maxTokens } : {}),
        ...(typeof input.temperature === "number"
            ? { temperature: input.temperature }
            : {}),
        ...(input.plugins ? { plugins: input.plugins } : {}),
    };
    recordProviderRequest({
        provider: "OpenRouter",
        operation: "chat.completions",
        model: input.model,
        request: requestBody,
    });
    const body = JSON.stringify(requestBody);
    let response;
    try {
        response = await tracedOpenRouterFetch(openRouterOperationName(body), OPENROUTER_CHAT_URL, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${input.apiKey}`,
                "Content-Type": "application/json",
                ...input.headers,
            },
            body,
            signal: AbortSignal.timeout(input.timeoutMs ?? 60_000),
        }, {
            feature: input.trace?.feature ?? "content-generation",
            userId: input.trace?.userId,
            sessionId: input.trace?.sessionId,
            metadata: input.trace?.metadata,
            fetchImpl,
        });
    }
    catch (error) {
        throw new OpenRouterRequestError({
            message: error instanceof Error && error.name === "TimeoutError"
                ? "The AI provider timed out"
                : "The AI provider could not be reached",
            code: "network_error",
            retryable: true,
            cause: error,
        });
    }
    const payload = (await response
        .json()
        .catch(() => ({})));
    return { ok: response.ok, status: response.status, payload };
}
export function parseOpenRouterContent(raw) {
    if (typeof raw === "string")
        return raw.trim();
    if (Array.isArray(raw)) {
        return raw
            .map((part) => {
            if (typeof part === "string")
                return part;
            if (isRecord(part) && typeof part.text === "string")
                return part.text;
            return "";
        })
            .join("")
            .trim();
    }
    if (raw && typeof raw === "object")
        return JSON.stringify(raw);
    if (raw === null)
        return "null";
    return "";
}
export async function openRouterJson(input) {
    const messages = input.messages ?? [
        { role: "system", content: input.system },
        { role: "user", content: input.user },
    ];
    const result = await openRouterChatCompletion({
        apiKey: input.apiKey,
        model: input.model,
        messages,
        fetchImpl: input.fetchImpl,
        responseFormat: input.schema
            ? {
                type: "json_schema",
                json_schema: sanitizeStructuredSchema(input.schema),
            }
            : { type: "json_object" },
        timeoutMs: input.timeoutMs,
        maxTokens: input.maxTokens,
        temperature: input.temperature,
        plugins: input.plugins,
        trace: input.trace,
    });
    if (!result.ok) {
        throw new OpenRouterRequestError({
            // OpenRouter's generic "Provider returned error" is undiagnosable on its
            // own; the upstream detail lives in error.metadata. Keep both.
            message: [
                result.payload.error?.message || `OpenRouter failed (${result.status})`,
                `status=${result.status}`,
                result.payload.error?.metadata
                    ? `metadata=${JSON.stringify(result.payload.error.metadata).slice(0, 500)}`
                    : "",
            ]
                .filter(Boolean)
                .join(" | "),
            status: result.status,
            code: "provider_error",
            retryable: result.status === 408 ||
                result.status === 409 ||
                result.status === 425 ||
                result.status === 429 ||
                result.status >= 500,
        });
    }
    try {
        const content = parseOpenRouterContent(result.payload.choices?.[0]?.message?.content)
            .replace(/^```(?:json)?\s*/i, "")
            .replace(/\s*```$/, "")
            .trim();
        const objectStart = content.indexOf("{");
        const objectEnd = content.lastIndexOf("}");
        const parsed = JSON.parse(content.slice(objectStart, objectEnd + 1));
        if (isRecord(parsed))
            return parsed;
    }
    catch {
        /* repair happens at the caller */
    }
    throw new OpenRouterRequestError({
        message: "The model returned invalid JSON",
        code: "invalid_json",
        retryable: true,
    });
}
