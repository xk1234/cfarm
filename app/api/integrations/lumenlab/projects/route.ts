import { getCurrentUser } from "@/lib/auth"
import { fetchLumenLabProjects } from "@/lib/lumenlab-hooks"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return Response.json({ error: "Authentication required." }, { status: 401 })
  }
  try {
    return Response.json(await fetchLumenLabProjects())
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not load LumenLab projects.",
      },
      { status: 502 }
    )
  }
}
