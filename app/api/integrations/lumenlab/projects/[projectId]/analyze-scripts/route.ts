import { getCurrentUser } from "@/lib/auth"
import { analyzeLumenLabProjectScripts } from "@/lib/lumenlab-hooks"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(
  _request: Request,
  context: { params: Promise<{ projectId: string }> }
) {
  const user = await getCurrentUser()
  if (!user) {
    return Response.json({ error: "Authentication required." }, { status: 401 })
  }
  const { projectId } = await context.params
  try {
    return Response.json(await analyzeLumenLabProjectScripts(projectId))
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not analyze scripts in LumenLab.",
      },
      { status: 502 }
    )
  }
}
