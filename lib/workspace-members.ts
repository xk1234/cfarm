import "server-only"

import { createHash, randomBytes } from "node:crypto"

import { clerkClient } from "@clerk/nextjs/server"

import type { AuthUser } from "@/lib/auth"
import { RailwayTablesCompat } from "@/lib/railway/appwrite-compat"

export type WorkspaceMember = {
  id: string
  email: string
  status: "pending" | "accepted"
  memberUserId?: string
  createdAt: string
}

type WorkspaceMemberRow = Record<string, unknown> & {
  $id: string
  email?: string
  owner_id?: string
  member_user_id?: string | null
  status?: string
  membership_id?: string
  created_at?: string
}

const DATABASE = "cfarm"
const TABLE = "workspace_members"
const tables = new RailwayTablesCompat()

function rowId(ownerId: string, email: string) {
  return `m${createHash("sha256")
    .update(`${ownerId}:${email}`)
    .digest("hex")
    .slice(0, 35)}`
}

async function allRows() {
  const response = await tables.listRows(DATABASE, TABLE, [])
  return response.rows as WorkspaceMemberRow[]
}

export async function listWorkspaceMembers(ownerId: string) {
  return (await allRows())
    .filter((row) => row.owner_id === ownerId)
    .map(
      (row) =>
        ({
          id: row.$id,
          email: String(row.email ?? ""),
          status: row.status === "accepted" ? "accepted" : "pending",
          memberUserId: row.member_user_id
            ? String(row.member_user_id)
            : undefined,
          createdAt: String(row.created_at ?? ""),
        }) satisfies WorkspaceMember
    )
    .toSorted((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
}

export async function inviteWorkspaceMember(input: {
  owner: AuthUser
  email: string
  redirectUrl: string
}) {
  const email = input.email.toLowerCase()
  const id = rowId(input.owner.$id, email)
  const existing = (await allRows()).find((row) => row.$id === id)
  if (existing) {
    throw Object.assign(new Error("This person has already been invited."), {
      code: 409,
    })
  }

  const inviteToken = randomBytes(24).toString("base64url")
  const redirect = new URL(input.redirectUrl)
  redirect.searchParams.set("invite", inviteToken)
  const client = await clerkClient()
  const invitation = await client.invitations.createInvitation({
    emailAddress: email,
    redirectUrl: redirect.toString(),
    publicMetadata: {
      lumenclipOwnerId: input.owner.$id,
      lumenclipInviteToken: inviteToken,
    },
  })

  const now = new Date().toISOString()
  await tables.createRow(DATABASE, TABLE, id, {
    owner_id: input.owner.$id,
    owner_name: input.owner.name || input.owner.email,
    email,
    member_user_id: null,
    status: "pending",
    team_id: "clerk",
    membership_id: inviteToken,
    clerk_invitation_id: invitation.id,
    created_at: now,
  })
  return { id, email, status: "pending" as const }
}

export async function acceptWorkspaceInvitation(input: {
  inviteToken: string
  user: AuthUser
}) {
  const row = (await allRows()).find(
    (candidate) =>
      candidate.membership_id === input.inviteToken &&
      candidate.status === "pending"
  )
  if (!row) throw new Error("Invitation record not found")
  if (String(row.email).toLowerCase() !== input.user.email.toLowerCase()) {
    throw new Error("Sign in with the invited email address")
  }
  await tables.updateRow(DATABASE, TABLE, row.$id, {
    status: "accepted",
    member_user_id: input.user.$id,
    email: input.user.email.toLowerCase(),
  })
}

export async function sharedOwnerIdsFor(user: AuthUser) {
  return (await allRows())
    .filter(
      (row) => row.status === "accepted" && row.member_user_id === user.$id
    )
    .map((row) => String(row.owner_id))
}
