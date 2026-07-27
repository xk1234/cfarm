// Generated from lib/publishing-core.ts. Do not edit by hand.
import { defaultPostFastProviderControls } from "./postfast-provider-controls.js";
export function effectivePostingMode(schema) {
    if (schema?.posting_mode === "auto" ||
        schema?.posting_mode === "review" ||
        schema?.posting_mode === "manual") {
        return schema.posting_mode;
    }
    return "auto";
}
export function postFastSchedulePayload(input) {
    const controls = defaultPostFastProviderControls(input.provider, input.settings);
    return {
        status: "SCHEDULED",
        posts: [
            {
                content: input.content,
                mediaItems: input.media.map((item, index) => ({
                    key: item.key,
                    type: item.type,
                    sortOrder: item.sortOrder ?? index,
                })),
                scheduledAt: input.scheduledFor,
                socialMediaId: input.integrationId,
                status: "SCHEDULED",
            },
        ],
        ...(Object.keys(controls).length ? { controls } : {}),
    };
}
