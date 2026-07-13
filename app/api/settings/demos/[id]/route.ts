import { getCurrentUser } from "@/lib/auth"
import { readDemoVideo } from "@/lib/demos"

export async function GET(
  _request: Request,
  context: RouteContext<"/api/settings/demos/[id]">
) {
  const user = await getCurrentUser()
  if (!user) return new Response("Unauthorized", { status: 401 })
  const { id } = await context.params
  const demo = await readDemoVideo(user.$id, id).catch(() => null)
  if (!demo) return new Response("Not found", { status: 404 })
  return new Response(demo.bytes, {
    headers: {
      "Content-Type": demo.contentType,
      "Cache-Control": "private, max-age=3600",
    },
  })
}
