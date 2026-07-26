// Generated from lib/slideshow-raster-renderer.ts. Do not edit by hand.
import { renderedSlideSvg } from "./slideshow-renderer.js";
export async function renderSlideshowSlideBuffers(input) {
    const svg = renderedSlideSvg(input.slide, input.sourceUrl, input.overlayUrl, {
        aspectRatio: input.aspectRatio,
        font: input.font,
        iconUrls: input.iconUrls,
    });
    const sharp = (await import("sharp")).default;
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    return { svg, png };
}
