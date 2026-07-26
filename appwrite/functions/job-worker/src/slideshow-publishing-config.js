// Generated from lib/slideshow-publishing-config.ts. Do not edit by hand.
export const automationLanguageOptions = [
    "English",
    "Chinese",
    "Malay",
    "Indian",
    "Spanish",
];
export const defaultAutomationLanguage = "English";
export const slideshowTransitionOptions = [
    { label: "Hard Cut", value: "hard" },
    { label: "Fade", value: "fade" },
    { label: "Slide", value: "slide" },
    { label: "Zoom", value: "zoom" },
];
export const defaultSlideshowTransition = "hard";
export const slideshowDurationOptions = [2, 3, 4, 5, 6, 8];
export const defaultSlideshowDuration = 4;
export const randomTikTokSoundLabel = "Random TikTok sound";
export const defaultAutomationPublishType = "slideshow";
export function deeplTargetLanguage(language) {
    switch (language.trim().toLowerCase()) {
        case "chinese":
            return "ZH-HANS";
        case "malay":
            return "MS";
        case "indian":
        case "hindi":
            return "HI";
        case "spanish":
            return "ES";
        case "english":
        default:
            return null;
    }
}
export function slideshowTransitionLabel(value) {
    return (slideshowTransitionOptions.find((option) => option.value === value)
        ?.label ?? value);
}
export function slideshowTransitionValue(labelOrValue) {
    const normalized = labelOrValue.trim().toLowerCase();
    return (slideshowTransitionOptions.find((option) => option.value === normalized || option.label.toLowerCase() === normalized)?.value ?? defaultSlideshowTransition);
}
export function slideshowDurationValue(value) {
    return Math.max(1, Number(value) || defaultSlideshowDuration);
}
