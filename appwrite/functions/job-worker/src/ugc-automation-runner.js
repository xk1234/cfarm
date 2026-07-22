// Generated from lib/ugc-automation-runner.ts. Do not edit by hand.
import crypto from "node:crypto";
export class UgcConfigurationError extends Error {
    nonRetryable = true;
    telegramNotified;
    constructor(message, options = {}) { super(message); this.name = "UgcConfigurationError"; this.telegramNotified = options.telegramNotified === true; }
}
export const ugcRunId = (automationId, scheduledFor) => `ugcrun${hash(`${automationId}:${scheduledFor}`, 29)}`;
export const ugcExportId = (automationId, scheduledFor) => `ugc-${hash(`${automationId}:${scheduledFor}`, 32)}`;
const stageOrder = ["analysis", "script", "actor", "voice", "motion", "lipsync", "broll", "composite", "store", "publish"];
export async function runUgcAutomation(input) {
    const runId = ugcRunId(input.automationId, input.scheduledFor), exportId = ugcExportId(input.automationId, input.scheduledFor);
    if (input.automation.status !== "live" || input.automation.schema?.status !== "live")
        return { skipped: true, reason: "not_live", runId, exportId, checkpoints: input.checkpoints ?? {} };
    if (input.automation.schema.ugc?.enabled !== true)
        return { skipped: true, reason: "ugc_disabled", runId, exportId, checkpoints: input.checkpoints ?? {} };
    const checkpoints = structuredClone(input.checkpoints ?? {});
    for (const stage of stageOrder) {
        const existing = checkpoints[stage];
        if (existing && await checkpointIsDurable(existing, input.assetExists)) {
            if (input.stopAfter === stage)
                break;
            continue;
        }
        const handler = input.stages[stage] ?? (stage === "analysis" ? input.stages.analyze : undefined);
        if (!handler) {
            if (input.stopAfter)
                continue;
            throw new Error(`UGC stage ${stage} is not configured`);
        }
        const value = await handler({ runId, exportId, checkpoints });
        const checkpoint = value && typeof value === "object" ? value : { value };
        checkpoints[stage] = checkpoint;
        await input.saveCheckpoint?.(stage, checkpoint, checkpoints);
        if (input.stopAfter === stage)
            break;
    }
    return { skipped: false, runId, exportId, checkpoints };
}
export async function checkpointIsDurable(checkpoint, assetExists) {
    const paths = [checkpoint.storagePath, ...(Array.isArray(checkpoint.storagePaths) ? checkpoint.storagePaths : [])].filter((value) => typeof value === "string" && value.length > 0);
    if (!paths.length)
        return true;
    if (!assetExists)
        return false;
    return (await Promise.all(paths.map((path) => assetExists(path)))).every(Boolean);
}
const hash = (value, length) => crypto.createHash("sha256").update(value).digest("hex").slice(0, length);
