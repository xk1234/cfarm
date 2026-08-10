// Generated from lib/provider-request-trace.ts. Do not edit by hand.
import { AsyncLocalStorage } from "node:async_hooks";
const requestTraceStorage = new AsyncLocalStorage();
export function recordProviderRequest(trace) {
    requestTraceStorage.getStore()?.push(structuredClone(trace));
}
export async function captureProviderRequests(task) {
    const existing = requestTraceStorage.getStore();
    const traces = existing ?? [];
    const start = traces.length;
    const execute = async () => {
        try {
            const result = await task();
            return {
                result,
                providerRequests: structuredClone(traces.slice(start)),
            };
        }
        catch (error) {
            if (error instanceof Error) {
                const requestError = error;
                requestError.providerRequests = structuredClone(traces.slice(start));
            }
            throw error;
        }
    };
    return existing ? execute() : requestTraceStorage.run(traces, execute);
}
export function providerRequestsFromError(error) {
    return error instanceof Error &&
        Array.isArray(error.providerRequests)
        ? structuredClone(error.providerRequests ?? [])
        : [];
}
