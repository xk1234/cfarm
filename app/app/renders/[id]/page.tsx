import { WorkspaceRoute } from "@/components/realfarm/routes/workspace-route"

export default async function RenderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <WorkspaceRoute navigation={{ view: "render", renderId: id }} />
}
