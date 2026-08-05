import { getCurrentUser } from "@/lib/auth"
import { fetchLumenLabProjectHooks } from "@/lib/lumenlab-hooks"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> }
) {
  const user = await getCurrentUser()
  if (!user) {
    return Response.json({ error: "Authentication required." }, { status: 401 })
  }
  const { projectId } = await context.params
  try {
    return Response.json(await fetchLumenLabProjectHooks(projectId))
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not load hooks from LumenLab.",
      },
      { status: 502 }
    )
  }
}
