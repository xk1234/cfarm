import "server-only"

import { Account, Client, ID, Users, type Models } from "node-appwrite"
import { cookies } from "next/headers"

import {
  APPWRITE_API_KEY,
  APPWRITE_ENDPOINT,
  APPWRITE_PROJECT_ID,
} from "@/lib/appwrite"

export const SESSION_COOKIE = "lumenclip-session"

export type AuthUser = Pick<
  Models.User<Models.Preferences>,
  "$id" | "email" | "name" | "emailVerification"
>

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
  if (!session || !APPWRITE_ENDPOINT || !APPWRITE_PROJECT_ID) return null
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

export async function createUser(input: {
  name: string
  email: string
  password: string
}) {
  return adminUsers().create({
    userId: ID.unique(),
    name: input.name,
    email: input.email,
    password: input.password,
  })
}

export async function createEmailSession(email: string, password: string) {
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
  return sessionAccount(session).createEmailVerification({ url })
}

export async function confirmEmailVerification(userId: string, secret: string) {
  // The token itself authenticates this request; it should not inherit the
  // server's admin identity.
  return new Account(baseClient()).updateEmailVerification({ userId, secret })
}

export async function deleteCurrentSession(session: string) {
  await sessionAccount(session).deleteSession({ sessionId: "current" })
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
