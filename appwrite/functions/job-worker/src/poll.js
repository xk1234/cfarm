// Generated from lib/poll.ts. Do not edit by hand.
import { sleepIfPositive } from "./guards.js";
export async function pollUntil(fn, options) {
    for (let attempt = 0; attempt < options.maxAttempts; attempt += 1) {
        const result = await fn(attempt);
        if (result !== null) {
            return result;
        }
        if (attempt < options.maxAttempts - 1) {
            await sleepIfPositive(options.intervalMs);
        }
    }
    throw new Error(options.timeoutMessage ||
        `Timed out waiting for ${options.description} after ${options.maxAttempts} attempts`);
}
