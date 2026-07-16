import { Query } from "node-appwrite"

import { APPWRITE_DATABASE_ID, getAppwrite } from "@/lib/appwrite"
import { getCurrentUser } from "@/lib/auth"

export type CalendarAlertSummary = {
  needsAction: number
  failed: number
}

export async function calendarAlertSummary(): Promise<CalendarAlertSummary> {
  const aw = getAppwrite()
  const user = await getCurrentUser()
  if (!aw || !user) return { needsAction: 0, failed: 0 }

  const [failedJobs, needsActionOutputs, failedOutputs] = await Promise.all([
    aw.tables.listRows(APPWRITE_DATABASE_ID, "jobs", [
      Query.equal("owner_id", [user.$id]),
      Query.equal("status", ["failed", "dead"]),
      Query.limit(1),
    ]),
    aw.tables.listRows(APPWRITE_DATABASE_ID, "outputs", [
      Query.equal("owner_id", [user.$id]),
      Query.equal("publication_status", [
        "awaiting_manual_post",
        "ready_for_review",
      ]),
      Query.limit(1),
    ]),
    aw.tables.listRows(APPWRITE_DATABASE_ID, "outputs", [
      Query.equal("owner_id", [user.$id]),
      Query.equal("publication_status", ["failed"]),
      Query.limit(1),
    ]),
  ])

  return {
    needsAction: needsActionOutputs.total,
    failed: failedJobs.total + failedOutputs.total,
  }
}
