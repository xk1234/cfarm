// Generated from lib/font-config.ts. Do not edit by hand.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BUNDLED_FONT_FILE } from "./slideshow-font-family.js";
export { BUNDLED_FONT_FAMILY, BUNDLED_FONT_FILE, resolveSlideshowFont, } from "./slideshow-font-family.js";
let configured = false;
let warnedMissing = false;
/**
 * Locate the bundled font directory. `process.cwd()` is not reliable — slideshow
 * rendering runs from temp working directories — so fall back to a path resolved
 * relative to this module before giving up.
 */
export function bundledFontDir() {
    const candidates = [
        path.join(process.cwd(), "assets", "fonts"),
        path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "assets", "fonts"),
    ];
    return (candidates.find((dir) => existsSync(path.join(dir, BUNDLED_FONT_FILE))) ??
        null);
}
/**
 * Ensure fontconfig can find the bundled TTF in environments that ship no
 * default font config (notably the Appwrite node-22 Alpine runtime). Writes a
 * minimal fonts.conf — with the font directory resolved at runtime, since the
 * absolute path differs between the Next app and the function container — into
 * a temp cache and points FONTCONFIG_FILE at it. Idempotent; must be called
 * before the first `sharp()` call that rasterizes SVG `<text>`.
 *
 * Returns whether fontconfig was configured. A missing font directory is NOT
 * fatal: rendering falls back to whatever fonts the host provides, which is the
 * pre-existing behaviour. Hard-failing here would turn a cosmetic problem
 * (tofu glyphs) into a total rendering outage.
 */
export function configureFontconfig(fontDir) {
    const resolved = fontDir ?? bundledFontDir();
    if (!resolved) {
        if (!warnedMissing) {
            warnedMissing = true;
            console.warn("configureFontconfig: bundled font directory not found; falling back to host fonts. Slide text may render as tofu on hosts without fonts.");
        }
        return false;
    }
    const absoluteDir = path.resolve(resolved);
    if (!existsSync(absoluteDir)) {
        if (!warnedMissing) {
            warnedMissing = true;
            console.warn(`configureFontconfig: bundled font directory not found: ${absoluteDir}; falling back to host fonts.`);
        }
        return false;
    }
    const cacheDir = path.join(os.tmpdir(), "cfarm-fontconfig");
    try {
        mkdirSync(cacheDir, { recursive: true });
    }
    catch {
        /* already present */
    }
    const confPath = path.join(cacheDir, "fonts.conf");
    const conf = `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>${absoluteDir}</dir>
  <cachedir>${cacheDir}</cachedir>
</fontconfig>
`;
    if (!existsSync(confPath) || readFileSync(confPath, "utf8") !== conf) {
        writeFileSync(confPath, conf);
    }
    if (process.env.FONTCONFIG_FILE !== confPath) {
        process.env.FONTCONFIG_FILE = confPath;
    }
    configured = true;
    return true;
}
/** Whether configureFontconfig has run in this process. For tests. */
export function fontconfigConfigured() {
    return configured;
}
/** Reset module state. Tests only — never call from app code. */
export function __resetFontconfigForTests() {
    configured = false;
    delete process.env.FONTCONFIG_FILE;
}
