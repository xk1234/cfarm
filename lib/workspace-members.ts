import "server-only"

import crypto from "node:crypto"
import { and, eq } from "drizzle-orm"

import type { AuthUser } from "@/lib/auth"
import { getRailwayOrm } from "@/lib/railway/database"
import { domainRecords } from "@/lib/railway/schema"

export type WorkspaceMember = {
  id: string
  email: string
  status: "pending" | "accepted"
  memberUserId?: string
  createdAt: string
}

const TABLE = "workspace_members"

type MemberPayload = {
  email: string
  status: string
  member_user_id?: string | null
  invite_token_hash: string
  created_at: string
}

type MemberRow = typeof domainRecords.$inferSelect & {
  payload: MemberPayload
}

function rowId(ownerId: string, email: string) {
  return `m${crypto
    .createHash("sha256")
    .update(`${ownerId}:${email}`)
    .digest("hex")
    .slice(0, 35)}`
}

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex")
}

function mapMember(row: MemberRow): WorkspaceMember {
  return {
    id: row.rowId,
    email: row.payload.email,
    status: row.payload.status === "accepted" ? "accepted" : "pending",
    memberUserId: row.payload.member_user_id || undefined,
    createdAt: row.payload.created_at,
  }
}

export async function listWorkspaceMembers(ownerId: string) {
  const rows = await getRailwayOrm()
    .select()
    .from(domainRecords)
    .where(
      and(eq(domainRecords.tableName, TABLE), eq(domainRecords.ownerId, ownerId))
    )
  return rows
    .map((row) => mapMember(row as MemberRow))
    .toSorted((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
}

export async function inviteWorkspaceMember(input: {
  owner: AuthUser
  email: string
  redirectUrl: string
}) {
  const email = input.email.trim().toLowerCase()
  const token = crypto.randomBytes(24).toString("base64url")
  const now = new Date().toISOString()
  await getRailwayOrm()
    .insert(domainRecords)
    .values({
      tableName: TABLE,
      rowId: rowId(input.owner.$id, email),
      ownerId: input.owner.$id,
      rid: email,
      name: email,
      status: "pending",
      payload: {
        email,
        status: "pending",
        member_user_id: null,
        invite_token_hash: hashToken(token),
        created_at: now,
      },
      sourceRow: {},
      createdAt: new Date(now),
      updatedAt: new Date(now),
    })
    .onConflictDoUpdate({
      target: [domainRecords.tableName, domainRecords.rowId],
      set: {
        payload: {
          email,
          status: "pending",
          member_user_id: null,
          invite_token_hash: hashToken(token),
          created_at: now,
        },
        updatedAt: new Date(now),
      },
    })
  const url = new URL(input.redirectUrl)
  url.searchParams.set("token", token)
  url.searchParams.set("email", email)
  return { id: rowId(input.owner.$id, email), email, inviteUrl: url.toString() }
}

export async function acceptWorkspaceInvitation(input: {
  token: string
  user: AuthUser
}) {
  const tokenHash = hashToken(input.token)
  const orm = getRailwayOrm()
  const rows = (await orm
    .select()
    .from(domainRecords)
    .where(eq(domainRecords.tableName, TABLE))) as MemberRow[]
  const invitation = rows.find(
    (row) =>
      row.payload.invite_token_hash === tokenHash &&
      row.payload.email.toLowerCase() === input.user.email.toLowerCase()
  )
  if (!invitation) throw new Error("Invitation record not found")
  const now = new Date().toISOString()
  await orm
    .update(domainRecords)
    .set({
      status: "accepted",
      updatedAt: new Date(now),
      payload: {
        ...invitation.payload,
        status: "accepted",
        member_user_id: input.user.$id,
      },
    })
    .where(eq(domainRecords.rowId, invitation.rowId))
}

export async function sharedOwnerIdsFor(_user: AuthUser): Promise<string[]> {
  const rows = (await getRailwayOrm()
    .select({ ownerId: domainRecords.ownerId })
    .from(domainRecords)
    .where(
      and(
        eq(domainRecords.tableName, TABLE),
        eq(domainRecords.status, "accepted")
      )
    )) as Array<{ ownerId: string | null }>
  return rows.flatMap((row) => (row.ownerId ? [row.ownerId] : []))
}
