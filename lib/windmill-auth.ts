import crypto from "node:crypto"

export function authorizeWindmillRequest(authorization: string | null) {
  const configured = process.env.WINDMILL_SHARED_SECRET?.trim()
  const supplied = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
  if (!configured || !supplied) return false
  const expectedBytes = Buffer.from(configured)
  const suppliedBytes = Buffer.from(supplied)
  return (
    expectedBytes.length === suppliedBytes.length &&
    crypto.timingSafeEqual(expectedBytes, suppliedBytes)
  )
}
