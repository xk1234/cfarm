// Generated from lib/langfuse-prompts.ts. Do not edit by hand.
import { ChatPromptClient, LangfuseClient, } from "@langfuse/client";
import { LUMENCLIP_PROMPT_DEFINITIONS, } from "./langfuse-prompt-catalog.js";
export const LANGFUSE_PROMPT_LABEL = "production";
export const LANGFUSE_PROMPT_CACHE_TTL_SECONDS = 300;
let client;
export async function getLumenclipChatPrompt(key, variables, options = {}) {
    const definition = LUMENCLIP_PROMPT_DEFINITIONS[key];
    const fallbackMessages = definition.prompt.map((message) => ({ ...message }));
    const promptManager = options.promptManager ?? defaultPromptManager();
    const credentialsAvailable = options.credentialsAvailable ?? hasLangfuseCredentials();
    if (!promptManager || !credentialsAvailable) {
        return localFallback(key, variables);
    }
    try {
        const prompt = await promptManager.get(definition.name, {
            type: "chat",
            label: LANGFUSE_PROMPT_LABEL,
            cacheTtlSeconds: LANGFUSE_PROMPT_CACHE_TTL_SECONDS,
            fallback: fallbackMessages,
            maxRetries: 1,
            fetchTimeoutMs: 2_000,
        });
        return {
            messages: compiledChatMessages(prompt.compile(variables)),
            prompt,
        };
    }
    catch {
        return localFallback(key, variables);
    }
}
export function compileLumenclipPromptFallback(key, variables) {
    const definition = LUMENCLIP_PROMPT_DEFINITIONS[key];
    const prompt = new ChatPromptClient({
        name: definition.name,
        type: "chat",
        version: 0,
        prompt: definition.prompt.map((message) => ({ ...message })),
        labels: [LANGFUSE_PROMPT_LABEL],
        tags: [],
        config: {},
    }, true);
    return {
        messages: compiledChatMessages(prompt.compile(variables)),
        prompt,
    };
}
function localFallback(key, variables) {
    return compileLumenclipPromptFallback(key, variables);
}
function defaultPromptManager() {
    if (!hasLangfuseCredentials())
        return undefined;
    client ??= new LangfuseClient();
    return client.prompt;
}
function hasLangfuseCredentials() {
    return Boolean(process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY);
}
function compiledChatMessages(value) {
    if (!Array.isArray(value))
        throw new Error("Langfuse prompt is not chat");
    return value.map((message) => {
        if (!message ||
            typeof message !== "object" ||
            !("role" in message) ||
            !("content" in message) ||
            typeof message.role !== "string" ||
            typeof message.content !== "string" ||
            !["system", "user", "assistant"].includes(message.role)) {
            throw new Error("Langfuse chat prompt contains an invalid message");
        }
        return {
            role: message.role,
            content: message.content,
        };
    });
}
