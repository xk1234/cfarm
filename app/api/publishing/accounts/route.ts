import { NextResponse } from "next/server"
import { z } from "zod"

import { validate } from "@/lib/api"
import { publishingRoute, readJson, requireWorkspace } from "@/lib/publishing/http"
import {
  listPublishingAccounts,
  setAccountDisabled,
  type PublishingAccount,
} from "@/lib/publishing/service"
import { normalizeSocialBuSocialIntegration } from "@/lib/social/socialbu-adapter"

export const dynamic = "force-dynamic"

/** Where accounts are connected; SocialBu owns the OAuth flows. */
const SOCIALBU_MANAGE_URL = "https://socialbu.com"

function integrations(accounts: PublishingAccount[]) {
  return accounts.flatMap((account) => {
    const integration = normalizeSocialBuSocialIntegration(account)
    return integration ? [integration] : []
  })
}

/**
 * SocialBu accounts. `accounts` is the full list (with `disabled` = hidden in
 * this workspace); `integrations` / `disconnectedIntegrations` are the
 * neutral shapes the account pickers read.
 */
export const GET = publishingRoute(async () => {
  const { workspaceId } = await requireWorkspace()
  const { status, accounts } = await listPublishingAccounts(workspaceId)
  return NextResponse.json({
    status,
    manageUrl: SOCIALBU_MANAGE_URL,
    accounts,
    integrations: integrations(accounts.filter((account) => !account.disabled)),
    disconnectedIntegrations: integrations(accounts.filter((account) => account.disabled)),
  })
})

const AccountBody = z
  .object({
    accountId: z.string().trim().min(1).max(64).optional(),
    integrationId: z.string().trim().min(1).max(64).optional(),
    disabled: z.boolean().optional(),
  })
  .refine((body) => body.accountId || body.integrationId, { message: "accountId is required" })

async function toggle(request: Request, disabledDefault: boolean) {
  const { workspaceId } = await requireWorkspace()
  const body = validate(AccountBody, await readJson(request))
  const accountId = (body.accountId ?? body.integrationId)!
  const disabledAccountIds = await setAccountDisabled(workspaceId, accountId, body.disabled ?? disabledDefault)
  return NextResponse.json({ disabledAccountIds })
}

/** `{ accountId, disabled }`: hide or show an account in the publish dialog. */
export const PATCH = publishingRoute((request) => toggle(request, true))
/** Hide an account (`{ accountId }`). */
export const DELETE = publishingRoute((request) => toggle(request, true))
/** Show a hidden account again (`{ accountId }`). */
export const POST = publishingRoute((request) => toggle(request, false))
