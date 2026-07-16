// Generated from lib/realfarm-slideshow-text-style-config.ts. Do not edit by hand.
export const slideshowTextFontOptions = [
    "Default",
    "Bebas Neue",
    "Elegance",
    "Elegance Italic",
];
export const slideshowTextColorOptions = [
    "Outline",
    "White Text",
    "Black Text",
    "Yellow Text",
    "White Background",
    "White 50% Background",
    "Black Background",
    "Black 50% Background",
    "Light Pink",
    "Muted Red",
    "Navy Blue",
];
export const slideshowTextSizeOptions = [
    "6px",
    "8px",
    "10px",
    "12px",
    "14px",
    "16px",
    "18px",
    "20px",
    "24px",
];
export const defaultSlideshowTextStyle = {
    font: "Default",
    color: "Yellow Text",
    size: "14px",
};
export const promptSlideshowTextStyle = {
    font: defaultSlideshowTextStyle.font,
    color: "Outline",
    size: "12px",
};
export function editorColorToTextStyle(color) {
    switch (color) {
        case "Yellow Text":
            return "yellowText";
        case "Black Text":
            return "blackText";
        case "White Background":
            return "whiteBackground";
        case "White 50% Background":
            return "white50Background";
        case "Black Background":
            return "blackBackground";
        case "Black 50% Background":
            return "black50Background";
        case "Light Pink":
            return "lightPink";
        case "Muted Red":
            return "mutedRed";
        case "Navy Blue":
            return "navyBlue";
        case "Outline":
            return "outline";
        case "White Text":
        default:
            return "whiteText";
    }
}
export function textStyleToEditorColor(style) {
    switch (style) {
        case "yellowText":
        case "yellow-text":
            return "Yellow Text";
        case "blackText":
        case "black-text":
            return "Black Text";
        case "background":
        case "whiteBackground":
        case "white-background":
            return "White Background";
        case "white50Background":
        case "white-50-background":
            return "White 50% Background";
        case "blackBackground":
        case "black-background":
            return "Black Background";
        case "black50Background":
        case "black-50-background":
            return "Black 50% Background";
        case "lightPink":
        case "light-pink":
            return "Light Pink";
        case "mutedRed":
        case "muted-red":
            return "Muted Red";
        case "navyBlue":
        case "navy-blue":
            return "Navy Blue";
        case "outline":
            return "Outline";
        case "whiteText":
        case "white-text":
        default:
            return "White Text";
    }
}
export function automationTextPreviewClassName(textStyle) {
    return textColorClass(textStyleToEditorColor(textStyle));
}
export function automationTextPreviewStyle(textItem) {
    const font = textItem.font?.trim();
    const textAlign = textItem.textAlign === "left"
        ? "left"
        : textItem.textAlign === "right"
            ? "right"
            : "center";
    return {
        top: textItem.textPosition === "top" || textItem.textAnchor === "flush"
            ? "14%"
            : textItem.textPosition === "bottom"
                ? "72%"
                : "42%",
        width: textItem.textItemWidth || "74%",
        fontSize: textItem.fontSize || "11px",
        textAlign,
        fontFamily: font && font !== "Default" && font !== "TikTok Display Medium"
            ? `${font}, sans-serif`
            : undefined,
        textShadow: textItem.textStyle === "outline"
            ? "0 1px 2px #000, 1px 0 2px #000, -1px 0 2px #000"
            : undefined,
    };
}
export function textColorClass(color) {
    switch (color) {
        case "Black Text":
            return "text-black";
        case "Yellow Text":
            return "text-yellow-100";
        case "White Background":
            return "bg-white text-black";
        case "White 50% Background":
            return "bg-white/50 text-black";
        case "Black Background":
            return "bg-black text-white";
        case "Black 50% Background":
            return "bg-black/50 text-white";
        case "Outline":
        case "White Text":
        default:
            return "text-white";
    }
}
export function editorFontSizeToCanvasPx(value) {
    const parsed = Number.parseFloat(value || "");
    return Number.isFinite(parsed)
        ? Math.max(28, Math.min(92, Math.round(parsed * 4.2)))
        : 52;
}
export function textFillColor(color) {
    switch (color) {
        case "Black Text":
        case "White Background":
        case "White 50% Background":
            return "#111";
        case "Yellow Text":
            return "#fef08a";
        case "Light Pink":
            return "#fbcfe8";
        case "Muted Red":
            return "#f87171";
        case "Navy Blue":
            return "#1e3a5f";
        default:
            return "#fff";
    }
}
export function textStyleUsesStroke(style) {
    const editorColor = slideshowTextColorOptions.includes(style)
        ? (style ?? "White Text")
        : textStyleToEditorColor(style || "");
    return editorColor === "Outline";
}
export function textStrokeColor(color) {
    return color === "Black Text" ? "rgba(255,255,255,0.75)" : "rgba(0,0,0,0.82)";
}
