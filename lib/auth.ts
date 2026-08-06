import "server-only"

import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto"
import { promisify } from "node:util"

import { Account, Client, ID, Users, type Models } from "node-appwrite"
import { cookies } from "next/headers"

import {
  APPWRITE_API_KEY,
  APPWRITE_ENDPOINT,
  APPWRITE_PROJECT_ID,
} from "@/lib/appwrite"
import { dataBackend } from "@/lib/backend-config"
import { getRailwayDatabase } from "@/lib/railway/database"

export const SESSION_COOKIE = "lumenclip-session"

export type AuthUser = Pick<
  Models.User<Models.Preferences>,
  "$id" | "email" | "name" | "emailVerification"
>

export type LumenClipUserPreferences = Models.Preferences & {
  postfastDisconnectedIntegrationIds?: string[]
  influlabConnection?: {
    baseUrl: string
    accessToken: string
    accountEmail: string
    connectedAt: string
  } | null
}

const scrypt = promisify(scryptCallback)
const sessionLifetimeMs = 30 * 24 * 60 * 60 * 1_000

function baseClient() {
  return new Client()
    .setEndpoint(APPWRITE_ENDPOINT)
    .setProject(APPWRITE_PROJECT_ID)
}

function sessionAccount(session: string) {
  return new Account(baseClient().setSession(session))
}

function adminAccount() {
  return new Account(baseClient().setKey(APPWRITE_API_KEY))
}

function adminUsers() {
  return new Users(baseClient().setKey(APPWRITE_API_KEY))
}

export async function getUserFromSession(
  session: string | null | undefined
): Promise<AuthUser | null> {
  if (!session) return null
  if (dataBackend() === "railway") {
    const local = await railwayUserForSession(session)
    if (local) return local
    // Existing browser sessions are promoted once during cutover. This bridge
    // can be removed after every imported user has signed in on Railway.
    const appwriteUser = await appwriteUserForSession(session)
    if (!appwriteUser) return null
    await persistRailwaySession(appwriteUser.$id, session)
    return appwriteUser
  }
  return appwriteUserForSession(session)
}

async function appwriteUserForSession(
  session: string
): Promise<AuthUser | null> {
  if (!APPWRITE_ENDPOINT || !APPWRITE_PROJECT_ID) return null
  try {
    const user = await sessionAccount(session).get()
    return {
      $id: user.$id,
      email: user.email,
      name: user.name,
      emailVerification: user.emailVerification,
    }
  } catch {
    return null
  }
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies()
  return getUserFromSession(cookieStore.get(SESSION_COOKIE)?.value)
}

export async function getUserPreferences(
  userId: string
): Promise<LumenClipUserPreferences> {
  if (dataBackend() === "railway") {
    const sql = getRailwayDatabase()
    const [row] = await sql<Array<{ preferences: LumenClipUserPreferences }>>`
      SELECT preferences FROM app_users WHERE id = ${userId}
    `
    if (!row) throw authError(404, "User not found.")
    return row.preferences ?? ({} as LumenClipUserPreferences)
  }
  return adminUsers().getPrefs<LumenClipUserPreferences>({ userId })
}

export async function updateUserPreferences(
  userId: string,
  patch: Partial<LumenClipUserPreferences>
) {
  const current = await getUserPreferences(userId)
  if (dataBackend() === "railway") {
    const preferences = { ...current, ...patch }
    const sql = getRailwayDatabase()
    const rows = await sql`
      UPDATE app_users
      SET preferences = ${sql.json(jsonValue(preferences))}, updated_at = now()
      WHERE id = ${userId}
      RETURNING id
    `
    if (rows.length === 0) throw authError(404, "User not found.")
    return preferences
  }
  return adminUsers().updatePrefs<LumenClipUserPreferences>({
    userId,
    prefs: { ...current, ...patch },
  })
}

export async function createUser(input: {
  name: string
  email: string
  password: string
}) {
  if (dataBackend() === "railway") {
    const id = ID.unique()
    const passwordHash = await hashPassword(input.password)
    const sql = getRailwayDatabase()
    try {
      await sql`
        INSERT INTO app_users (
          id, email, name, email_verified, password_hash,
          requires_password_reset, preferences
        ) VALUES (
          ${id}, ${input.email.toLowerCase()}, ${input.name}, false,
          ${passwordHash}, false, '{}'::jsonb
        )
      `
    } catch (error) {
      if ((error as { code?: string }).code === "23505") {
        throw authError(409, "An account already exists for this email.")
      }
      throw error
    }
    return { $id: id, email: input.email, name: input.name }
  }
  return adminUsers().create({
    userId: ID.unique(),
    name: input.name,
    email: input.email,
    password: input.password,
  })
}

export async function createEmailSession(email: string, password: string) {
  if (dataBackend() === "railway") {
    const sql = getRailwayDatabase()
    const [user] = await sql<
      Array<{ id: string; password_hash: string | null }>
    >`
      SELECT id, password_hash FROM app_users WHERE lower(email) = ${email.toLowerCase()}
    `
    if (!user) throw authError(401, "Invalid email or password.")

    if (user.password_hash) {
      if (!(await verifyPassword(password, user.password_hash))) {
        throw authError(401, "Invalid email or password.")
      }
      return createRailwaySession(user.id)
    }

    // Appwrite does not export password hashes. Validate an imported account
    // there once, then persist a Railway hash so future logins are independent.
    if (!APPWRITE_ENDPOINT || !APPWRITE_PROJECT_ID || !APPWRITE_API_KEY) {
      throw authError(401, "This migrated account requires a password reset.")
    }
    const legacy = await adminAccount().createEmailPasswordSession({
      email,
      password,
    })
    if (!legacy.secret) throw authError(401, "Invalid email or password.")
    await sql`
      UPDATE app_users
      SET password_hash = ${await hashPassword(password)},
          requires_password_reset = false, updated_at = now()
      WHERE id = ${user.id}
    `
    await persistRailwaySession(user.id, legacy.secret, legacy.expire)
    return legacy
  }
  // Appwrite only exposes the session secret to a trusted Server SDK request.
  // Without the API key the account is created, but the SSR cookie receives an
  // empty value and every protected route immediately redirects back to login.
  const session = await adminAccount().createEmailPasswordSession({
    email,
    password,
  })

  if (!session.secret) {
    throw new Error("Appwrite did not return a session secret")
  }

  return session
}

export async function sendEmailVerification(session: string, url: string) {
  if (dataBackend() === "railway") {
    // Imported Appwrite sessions can still use the existing mail delivery
    // during the auth bridge. Native Railway accounts need SMTP configured in
    // a follow-up before verification mail can be delivered.
    if (!APPWRITE_ENDPOINT || !APPWRITE_PROJECT_ID) {
      throw new Error("Email verification delivery is not configured.")
    }
  }
  return sessionAccount(session).createEmailVerification({ url })
}

export async function confirmEmailVerification(userId: string, secret: string) {
  // The token itself authenticates this request; it should not inherit the
  // server's admin identity.
  const result = await new Account(baseClient()).updateEmailVerification({
    userId,
    secret,
  })
  if (dataBackend() === "railway") {
    const sql = getRailwayDatabase()
    await sql`
      UPDATE app_users SET email_verified = true, updated_at = now()
      WHERE id = ${userId}
    `
  }
  return result
}

export async function sendPasswordRecovery(email: string, url: string) {
  // Unauthenticated by design: the caller has lost access to the account, so
  // this cannot run as the session or as the admin key.
  return new Account(baseClient()).createRecovery({ email, url })
}

export async function confirmPasswordRecovery(
  userId: string,
  secret: string,
  password: string
) {
  // The emailed secret authenticates this request; it must not inherit the
  // server's admin identity.
  const result = await new Account(baseClient()).updateRecovery({
    userId,
    secret,
    password,
  })
  if (dataBackend() === "railway") {
    const sql = getRailwayDatabase()
    await sql`
      UPDATE app_users
      SET password_hash = ${await hashPassword(password)},
          requires_password_reset = false, updated_at = now()
      WHERE id = ${userId}
    `
  }
  return result
}

export async function deleteCurrentSession(session: string) {
  if (dataBackend() === "railway") {
    const sql = getRailwayDatabase()
    await sql`
      UPDATE auth_sessions SET revoked_at = now()
      WHERE secret_hash = ${sessionHash(session)} AND revoked_at IS NULL
    `
    // The session may have originated in Appwrite during the bridge.
    if (APPWRITE_ENDPOINT && APPWRITE_PROJECT_ID) {
      await sessionAccount(session)
        .deleteSession({ sessionId: "current" })
        .catch(() => undefined)
    }
    return
  }
  await sessionAccount(session).deleteSession({ sessionId: "current" })
}

async function railwayUserForSession(
  session: string
): Promise<AuthUser | null> {
  const sql = getRailwayDatabase()
  const [row] = await sql<
    Array<{
      id: string
      email: string
      name: string
      email_verified: boolean
    }>
  >`
    SELECT u.id, u.email, u.name, u.email_verified
    FROM auth_sessions s
    JOIN app_users u ON u.id = s.user_id
    WHERE s.secret_hash = ${sessionHash(session)}
      AND s.revoked_at IS NULL AND s.expires_at > now()
  `
  if (!row) return null
  await sql`
    UPDATE auth_sessions SET last_seen_at = now()
    WHERE secret_hash = ${sessionHash(session)}
  `
  return {
    $id: row.id,
    email: row.email,
    name: row.name,
    emailVerification: row.email_verified,
  }
}

async function createRailwaySession(userId: string) {
  const secret = randomBytes(32).toString("base64url")
  const expire = new Date(Date.now() + sessionLifetimeMs).toISOString()
  await persistRailwaySession(userId, secret, expire)
  return { $id: ID.unique(), secret, expire }
}

async function persistRailwaySession(
  userId: string,
  secret: string,
  expiresAt = new Date(Date.now() + sessionLifetimeMs).toISOString()
) {
  const sql = getRailwayDatabase()
  await sql`
    INSERT INTO auth_sessions (id, user_id, secret_hash, expires_at)
    VALUES (${ID.unique()}, ${userId}, ${sessionHash(secret)}, ${expiresAt})
    ON CONFLICT (secret_hash) DO UPDATE SET
      expires_at = greatest(auth_sessions.expires_at, excluded.expires_at),
      revoked_at = NULL, last_seen_at = now()
  `
}

function sessionHash(secret: string) {
  return createHash("sha256").update(secret).digest("hex")
}

async function hashPassword(password: string) {
  const salt = randomBytes(16)
  const derived = (await scrypt(password, salt, 64)) as Buffer
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`
}

async function verifyPassword(password: string, encoded: string) {
  const [algorithm, saltText, hashText] = encoded.split("$")
  if (algorithm !== "scrypt" || !saltText || !hashText) return false
  const expected = Buffer.from(hashText, "base64url")
  const actual = (await scrypt(
    password,
    Buffer.from(saltText, "base64url"),
    expected.length
  )) as Buffer
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

function authError(code: number, message: string) {
  return Object.assign(new Error(message), { code })
}

function jsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value))
}

export function sessionCookieOptions(expires?: string) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    ...(expires ? { expires: new Date(expires) } : {}),
  }
}
