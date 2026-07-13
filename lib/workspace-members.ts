import "server-only"

import crypto from "node:crypto"
import { Client, Query, Teams } from "node-appwrite"

import {
  APPWRITE_API_KEY,
  APPWRITE_DATABASE_ID,
  APPWRITE_ENDPOINT,
  APPWRITE_PROJECT_ID,
  getAppwrite,
} from "@/lib/appwrite"
import type { AuthUser } from "@/lib/auth"

export type WorkspaceMember = {
  id: string
  email: string
  status: "pending" | "accepted"
  memberUserId?: string
  createdAt: string
}

const TABLE = "workspace_members"

function client() {
  return new Client()
    .setEndpoint(APPWRITE_ENDPOINT)
    .setProject(APPWRITE_PROJECT_ID)
    .setKey(APPWRITE_API_KEY)
}

function workspaceTeamId(ownerId: string) {
  return `workspace-${ownerId}`.slice(0, 36)
}

function rowId(ownerId: string, email: string) {
  return `m${crypto
    .createHash("sha256")
    .update(`${ownerId}:${email}`)
    .digest("hex")
    .slice(0, 35)}`
}

export async function listWorkspaceMembers(ownerId: string) {
  const aw = getAppwrite()
  if (!aw) throw new Error("Appwrite is not configured")
  const response = await aw.tables.listRows(APPWRITE_DATABASE_ID, TABLE, [
    Query.equal("owner_id", [ownerId]),
    Query.limit(100),
  ])
  return response.rows
    .map(
      (row) =>
        ({
          id: String(row.$id),
          email: String(row.email),
          status: row.status === "accepted" ? "accepted" : "pending",
          memberUserId: row.member_user_id
            ? String(row.member_user_id)
            : undefined,
          createdAt: String(row.created_at),
        }) satisfies WorkspaceMember
    )
    .toSorted((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
}

export async function inviteWorkspaceMember(input: {
  owner: AuthUser
  email: string
  redirectUrl: string
}) {
  const aw = getAppwrite()
  if (!aw) throw new Error("Appwrite is not configured")
  const teams = new Teams(client())
  const teamId = workspaceTeamId(input.owner.$id)
  await teams
    .create({
      teamId,
      name: `${input.owner.name || input.owner.email}'s LumenClip workspace`,
      roles: ["owner"],
    })
    .catch((error: { code?: number }) => {
      if (error.code !== 409) throw error
    })
  const membership = await teams.createMembership({
    teamId,
    roles: ["collaborator"],
    email: input.email,
    url: input.redirectUrl,
  })
  const now = new Date().toISOString()
  await aw.tables.upsertRow(
    APPWRITE_DATABASE_ID,
    TABLE,
    rowId(input.owner.$id, input.email),
    {
      owner_id: input.owner.$id,
      owner_name: input.owner.name || input.owner.email,
      email: input.email,
      member_user_id: null,
      status: "pending",
      team_id: teamId,
      membership_id: membership.$id,
      created_at: now,
    }
  )
  return { id: membership.$id, email: input.email, status: "pending" as const }
}

export async function acceptWorkspaceInvitation(input: {
  teamId: string
  membershipId: string
  userId: string
  secret: string
  user: AuthUser
}) {
  const teams = new Teams(
    new Client().setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT_ID)
  )
  await teams.updateMembershipStatus({
    teamId: input.teamId,
    membershipId: input.membershipId,
    userId: input.userId,
    secret: input.secret,
  })
  const aw = getAppwrite()
  if (!aw) throw new Error("Appwrite is not configured")
  const response = await aw.tables.listRows(APPWRITE_DATABASE_ID, TABLE, [
    Query.equal("team_id", [input.teamId]),
    Query.equal("membership_id", [input.membershipId]),
    Query.limit(1),
  ])
  const row = response.rows[0]
  if (!row) throw new Error("Invitation record not found")
  await aw.tables.updateRow(APPWRITE_DATABASE_ID, TABLE, row.$id, {
    status: "accepted",
    member_user_id: input.user.$id,
    email: input.user.email,
  })
}

export async function sharedOwnerIdsFor(user: AuthUser) {
  const aw = getAppwrite()
  if (!aw) return []
  const response = await aw.tables.listRows(APPWRITE_DATABASE_ID, TABLE, [
    Query.equal("status", ["accepted"]),
    Query.equal("member_user_id", [user.$id]),
    Query.limit(100),
  ])
  return response.rows.map((row) => String(row.owner_id))
}
