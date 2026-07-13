/**
 * Build a base64 `data:` URL from raw bytes. Accepts a Buffer or Uint8Array
 * (e.g. from `readAssetBytes` or `readFile`), so callers don't re-implement the
 * `data:${mime};base64,${...toString("base64")}` construction each time.
 */
export function toDataUrl(bytes: Uint8Array | Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`
}
