// Generated from lib/slideshow-renderer.ts. Do not edit by hand.
import { clean } from "./guards.js";
import { textStyleToEditorColor, textStyleUsesStroke, } from "./realfarm-slideshow-text-style-config.js";
export const slideshowOverlayOpacity = 0.2;
export function slideshowTextPositionX(textAlign, textAnchor) {
    const flush = textAnchor === "flush";
    if (textAlign === "left")
        return flush ? 1.5 : 10;
    if (textAlign === "right")
        return flush ? 98.5 : 90;
    return 50;
}
export const defaultSlideshowAspectRatio = "9:16";
export const defaultSlideshowFont = "TikTok Display Medium";
export function renderedSlideSvg(slide, sourceUrl, overlayUrl, opts) {
    const { width, height } = slideDimensions(opts?.aspectRatio || defaultSlideshowAspectRatio);
    const font = opts?.font || defaultSlideshowFont;
    const textItems = slide.textItems;
    const overlayImageSvg = slide.overlayImage && overlayUrl
        ? renderedOverlayImageSvg(slide.overlayImage, overlayUrl, width, height)
        : null;
    const overlayAlpha = slide.overlay ? slideshowOverlayOpacity : 0;
    return [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
        `<rect width="${width}" height="${height}" fill="#111"/>`,
        `<image href="${escapeXml(sourceUrl)}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice"/>`,
        overlayAlpha > 0
            ? `<rect data-layer="overlay" width="${width}" height="${height}" fill="#000" opacity="${overlayAlpha}"/>`
            : null,
        overlayImageSvg,
        ...renderedTextItemsSvg(textItems, width, height, font),
        `</svg>`,
    ]
        .filter(Boolean)
        .join("");
}
export function slideDimensions(aspectRatio) {
    switch (aspectRatio) {
        case "4:5":
            return { width: 1080, height: 1350 };
        case "1:1":
            return { width: 1080, height: 1080 };
        case "9:16":
        default:
            return { width: 1080, height: 1920 };
    }
}
function renderedOverlayImageSvg(overlayImage, overlayUrl, slideWidth, slideHeight) {
    const padding = Math.max(0, Math.min(40, overlayImage.padding));
    const overlayWidth = Math.round(slideWidth * Math.max(20, 100 - padding * 2) * 0.01);
    const overlayHeight = Math.round(overlayWidth * (9 / 16));
    const x = Math.round((slideWidth - overlayWidth) / 2);
    const y = Math.round(Math.min(slideHeight - overlayHeight, Math.max(0, slideHeight * 0.5 - overlayHeight * 0.42)));
    return `<image href="${escapeXml(overlayUrl)}" x="${x}" y="${y}" width="${overlayWidth}" height="${overlayHeight}" preserveAspectRatio="xMidYMid slice"/>`;
}
function renderedTextItemsSvg(items, width, height, font) {
    return layoutRenderedTextItems(items, width, height).map((rendered) => renderedTextItemSvg(rendered, font));
}
function layoutRenderedTextItems(items, width, height) {
    const groups = new Map();
    for (const item of items) {
        const prepared = prepareRenderedTextItem(item, width, height);
        const key = item.textPlacement
            ? `placement:${item.textPlacement}`
            : `position:${Math.round(prepared.y)}`;
        groups.set(key, [...(groups.get(key) ?? []), prepared]);
    }
    return Array.from(groups.values()).flatMap((group) => stackedTextGroup(group, height));
}
export function renderedTextItemBounds(items, width, height) {
    return layoutRenderedTextItems(items, width, height).map((rendered) => renderedTextBounds(rendered, width, height));
}
// Editing uses the configured text box width, not only the glyph bounds. This
// makes Width immediately visible and gives the whole wrapping area a stable
// click target while preserving the tight bounds used by layout tests.
export function renderedTextItemEditorBounds(items, width, height) {
    return layoutRenderedTextItems(items, width, height).map((rendered) => {
        const tight = renderedTextBounds(rendered, width, height);
        const left = rendered.item.textAlign === "left"
            ? rendered.x
            : rendered.item.textAlign === "right"
                ? rendered.x - rendered.textBoxWidth
                : rendered.x - rendered.textBoxWidth / 2;
        const boundedLeft = Math.max(0, Math.min(width, left));
        return {
            ...tight,
            left: boundedLeft,
            width: Math.max(0, Math.min(rendered.textBoxWidth, width - boundedLeft)),
        };
    });
}
function renderedTextBounds(rendered, width, height) {
    const { item, x, y, fontSize, lineHeight, lines } = rendered;
    const strokePadding = needsTextStroke(item.textStyle)
        ? Math.max(6, fontSize * 0.13) / 2
        : 0;
    const horizontalPadding = strokePadding + 4;
    const verticalPadding = strokePadding + 3;
    const textWidth = Math.max(fontSize * 0.55, ...lines.map((line) => textDisplayUnits(line) * fontSize));
    const firstLineTop = y - fontSize * 0.52;
    const lastLineBottom = y + Math.max(0, lines.length - 1) * lineHeight + fontSize * 0.52;
    const left = item.textAlign === "left"
        ? x
        : item.textAlign === "right"
            ? x - textWidth
            : x - textWidth / 2;
    return {
        id: item.id,
        left: Math.max(0, left - horizontalPadding),
        top: Math.max(0, firstLineTop - verticalPadding),
        width: Math.min(width, textWidth + horizontalPadding * 2),
        height: Math.min(height, lastLineBottom - firstLineTop + verticalPadding * 2),
    };
}
function prepareRenderedTextItem(item, width, height) {
    const fontSize = Math.max(32, Math.min(96, parseFontSize(item.fontSize) * 4));
    const textBoxWidth = textItemPixelWidth(item, width);
    const x = textItemX(item, width, textBoxWidth);
    const lines = wrapText(item.text, Math.max(4, textBoxWidth / fontSize));
    const lineHeight = fontSize * 1.12;
    const blockHeight = Math.max(fontSize, lines.length * lineHeight);
    const y = textItemY(item, height, blockHeight);
    return {
        item,
        x,
        y,
        fontSize,
        lineHeight,
        lines,
        blockHeight,
        textBoxWidth,
    };
}
function stackedTextGroup(group, slideHeight) {
    if (group.length <= 1) {
        return group;
    }
    if (!hasHorizontalOverlap(group)) {
        return group;
    }
    const gap = Math.max(20, Math.min(...group.map((item) => item.fontSize)) * 1.1);
    const totalHeight = group.reduce((total, item) => total + item.blockHeight, 0) +
        gap * (group.length - 1);
    const minTop = 20;
    const maxTop = Math.max(minTop, slideHeight - totalHeight - 20);
    let cursor = Math.min(maxTop, Math.max(minTop, group[0].y - group[0].blockHeight / 2));
    return group.map((item) => {
        const y = cursor + item.blockHeight / 2;
        cursor += item.blockHeight + gap;
        return { ...item, y };
    });
}
function hasHorizontalOverlap(group) {
    const ranges = group.map((item) => {
        const left = item.item.textAlign === "right"
            ? item.x - item.textBoxWidth
            : item.item.textAlign === "left"
                ? item.x
                : item.x - item.textBoxWidth / 2;
        return { left, right: left + item.textBoxWidth };
    });
    return ranges.some((range, index) => ranges
        .slice(index + 1)
        .some((other) => range.left < other.right && other.left < range.right));
}
function renderedTextItemSvg(rendered, font) {
    const { item, x, y, fontSize, lineHeight, lines } = rendered;
    const textAnchor = svgTextAnchor(item.textAlign);
    const fill = textFill(item.textStyle);
    const stroke = needsTextStroke(item.textStyle)
        ? ` stroke="#000000" stroke-opacity="0.88" stroke-width="${Math.max(6, fontSize * 0.13)}" paint-order="stroke"`
        : "";
    const tspans = lines
        .map((line, index) => {
        const dy = index === 0 ? 0 : lineHeight;
        return `<tspan x="${x}" dy="${dy}">${escapeXml(line)}</tspan>`;
    })
        .join("");
    const fontFamily = escapeXml(font || defaultSlideshowFont);
    const background = renderedTextBackgroundSvg(rendered);
    return `${background}<text id="${escapeXml(item.id)}" x="${x}" y="${y}" text-anchor="${textAnchor}" dominant-baseline="middle" font-family="${fontFamily}, Inter, Arial, sans-serif" font-size="${fontSize}" font-weight="800" fill="${fill}"${stroke}>${tspans}</text>`;
}
function renderedTextBackgroundSvg(rendered) {
    const color = textStyleToEditorColor(rendered.item.textStyle);
    if (!color.endsWith("Background"))
        return "";
    const paddingX = rendered.fontSize * 0.28;
    const paddingY = rendered.fontSize * 0.1;
    const height = rendered.fontSize * 1.1 + paddingY * 2;
    const fill = color.startsWith("White") ? "#ffffff" : "#111111";
    const opacity = color.includes("50%") ? 0.56 : 0.9;
    return rendered.lines
        .map((line, index) => {
        const textWidth = Math.max(rendered.fontSize * 0.55, textDisplayUnits(line) * rendered.fontSize);
        const width = textWidth + paddingX * 2;
        const left = rendered.item.textAlign === "left"
            ? rendered.x - paddingX
            : rendered.item.textAlign === "right"
                ? rendered.x - textWidth - paddingX
                : rendered.x - width / 2;
        const lineY = rendered.y + index * rendered.lineHeight;
        const top = lineY - rendered.fontSize * 0.55 - paddingY;
        return `<rect data-text-background="${escapeXml(rendered.item.id)}" data-text-background-line="${index}" x="${left}" y="${top}" width="${width}" height="${height}" rx="${Math.max(3, rendered.fontSize * 0.06)}" fill="${fill}" fill-opacity="${opacity}"/>`;
    })
        .join("");
}
function textItemY(item, slideHeight, blockHeight) {
    const safeMargin = item.textVerticalAnchor === "flush"
        ? Math.max(20, slideHeight * 0.05)
        : Math.max(32, slideHeight * 0.16);
    if (item.textPlacement === "top") {
        return Math.round(safeMargin);
    }
    if (item.textPlacement === "bottom") {
        return Math.round(Math.max(safeMargin, slideHeight - safeMargin));
    }
    if (item.textPlacement === "center") {
        return Math.round(slideHeight * 0.45);
    }
    const raw = clampPercent(item.textPosition.y) * slideHeight;
    const min = Math.max(20, blockHeight / 2 + 20);
    const max = Math.max(min, slideHeight - blockHeight / 2 - 20);
    return Math.round(Math.min(max, Math.max(min, raw)));
}
function textItemX(item, slideWidth, textBoxWidth) {
    const safeMargin = item.textAnchor === "flush"
        ? Math.max(8, slideWidth * 0.015)
        : Math.max(20, slideWidth * 0.1);
    const raw = clampPercent(item.textPosition.x) * slideWidth;
    if (item.textAlign === "left") {
        const max = Math.max(safeMargin, slideWidth - textBoxWidth - safeMargin);
        return Math.round(Math.min(max, Math.max(safeMargin, raw)));
    }
    if (item.textAlign === "right") {
        const min = Math.min(slideWidth - safeMargin, textBoxWidth + safeMargin);
        return Math.round(Math.min(slideWidth - safeMargin, Math.max(min, raw)));
    }
    const min = Math.min(slideWidth - safeMargin, textBoxWidth / 2 + safeMargin);
    const max = Math.max(min, slideWidth - textBoxWidth / 2 - safeMargin);
    return Math.round(Math.min(max, Math.max(min, raw)));
}
function textItemPixelWidth(item, slideWidth) {
    return Math.round(Math.max(10, Math.min(100, item.textSize.width)) * 0.01 * slideWidth);
}
function parseFontSize(value) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 12;
}
function clampPercent(value) {
    const normalized = Number.isFinite(value) ? value : 50;
    return Math.min(1, Math.max(0, normalized / 100));
}
function svgTextAnchor(value) {
    if (value === "left")
        return "start";
    if (value === "right")
        return "end";
    return "middle";
}
function textFill(style) {
    const editorColor = textStyleToEditorColor(style);
    if (editorColor === "Yellow Text")
        return "#fff176";
    if (editorColor === "Black Text" || editorColor === "White Background")
        return "#111111";
    return "#ffffff";
}
function needsTextStroke(style) {
    return textStyleUsesStroke(style);
}
function wrapText(text, maxLineUnits) {
    const tokens = textWrapTokens(clean(text));
    if (tokens.length === 0) {
        return [""];
    }
    const lines = [];
    let current = "";
    for (const token of tokens) {
        const next = current ? `${current}${token}` : token.trimStart();
        if (textDisplayUnits(next) > maxLineUnits && current) {
            lines.push(current);
            current = token.trimStart();
            continue;
        }
        if (textDisplayUnits(next) > maxLineUnits) {
            const chunks = chunkLongTextToken(next, maxLineUnits);
            lines.push(...chunks.slice(0, -1));
            current = chunks.at(-1) ?? "";
        }
        else {
            current = next;
        }
    }
    if (current) {
        lines.push(current);
    }
    return lines;
}
function textWrapTokens(text) {
    const words = text.match(/\s*\S+/gu) ?? [];
    return words.flatMap((word) => textDisplayUnits(word.trim()) > 16 && containsUnspacedScript(word)
        ? Array.from(word)
        : [word]);
}
function chunkLongTextToken(token, maxLineUnits) {
    const chunks = [];
    let current = "";
    for (const character of Array.from(token)) {
        const next = `${current}${character}`;
        if (textDisplayUnits(next) > maxLineUnits && current) {
            chunks.push(current);
            current = character.trimStart();
        }
        else {
            current = next;
        }
    }
    if (current) {
        chunks.push(current);
    }
    return chunks;
}
function textDisplayUnits(text) {
    return Array.from(text).reduce((total, character) => {
        if (containsUnspacedScript(character))
            return total + 1;
        return total + (character.charCodeAt(0) > 255 ? 1.2 : 0.55);
    }, 0);
}
function containsUnspacedScript(text) {
    return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(text);
}
function escapeXml(value) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}
