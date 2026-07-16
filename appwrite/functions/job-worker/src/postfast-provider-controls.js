// Generated from lib/postfast-provider-controls.ts. Do not edit by hand.
export function defaultPostFastProviderControls(provider, overrides = {}) {
    const base = providerDefaults(provider);
    return { ...base, ...compactControls(overrides) };
}
function providerDefaults(provider) {
    switch (provider) {
        case "tiktok":
            return {
                tiktokTitle: "",
                tiktokIsDraft: false,
                tiktokAllowComments: true,
                tiktokAllowDuet: true,
                tiktokAllowStitch: true,
                tiktokBrandOrganic: false,
                tiktokBrandContent: false,
                tiktokAutoAddMusic: false,
                tiktokIsAigc: false,
            };
        case "facebook":
            return { facebookContentType: "POST" };
        case "instagram":
            return { instagramPublishType: "TIMELINE", instagramPostToGrid: true };
        case "youtube":
            return {
                youtubeTitle: "",
                youtubePrivacy: "PUBLIC",
                youtubeIsShort: true,
                youtubeMadeForKids: false,
                youtubeTags: [],
            };
        case "x":
        case "twitter":
            return { xRetweetUrl: "" };
        case "linkedin":
            return {
                linkedinAttachmentKey: "",
                linkedinVisibility: "PUBLIC",
            };
        case "pinterest":
            return {
                pinterestBoardId: "",
                pinterestLink: "",
            };
        case "google":
        case "google-business-profile":
            return {
                gbpLocationId: "",
                gbpPostType: "STANDARD",
                gbpEventStartDate: "",
                gbpEventEndDate: "",
            };
        default:
            return {};
    }
}
function compactControls(settings) {
    return Object.fromEntries(Object.entries(settings).filter(([, value]) => typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean" ||
        value === null ||
        (Array.isArray(value) &&
            value.every((item) => typeof item === "string"))));
}
