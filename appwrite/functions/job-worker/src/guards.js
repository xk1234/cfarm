// Generated from lib/guards.ts. Do not edit by hand.
export function clean(value) {
    return typeof value === "string" ? value.trim() : "";
}
export function cleanCollapsedWhitespace(value) {
    return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}
export function cleanString(value) {
    return value.trim();
}
export function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function isLooseRecord(value) {
    return value && typeof value === "object" ? value : null;
}
export function readRecord(value) {
    return isRecord(value) ? value : undefined;
}
export function readLooseRecord(value) {
    return isLooseRecord(value);
}
export function readString(value) {
    return typeof value === "string" && value.length > 0 ? value : "";
}
export function readOptionalString(value) {
    return typeof value === "string" && value.length > 0 ? value : undefined;
}
export function readTrimmedString(value) {
    return typeof value === "string" ? value.trim() : "";
}
export function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
export function sleepIfPositive(ms) {
    return ms > 0
        ? new Promise((resolve) => setTimeout(resolve, ms))
        : Promise.resolve();
}
