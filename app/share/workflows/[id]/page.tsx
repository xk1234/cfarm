import { notFound } from "next/navigation"

import { PublicWorkflowTrace } from "@/components/realfarm/public-workflow-trace"
import { publicSlideshowImageUrl } from "@/lib/public-slideshow-assets"
import { buildSlideshowWorkflowTrace } from "@/lib/slideshow-workflow-trace"
import { loadSharedSlideshowWorkflow } from "@/lib/slideshow-share"

export const dynamic = "force-dynamic"

export default async function SharedWorkflowPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ token?: string | string[] }>
}) {
  const [{ id }, query] = await Promise.all([params, searchParams])
  const token = typeof query.token === "string" ? query.token : ""
  const source = token ? await loadSharedSlideshowWorkflow(id, token) : null
  if (!source) notFound()

  const renderedImageUrls = source.slideshow.output_images.map((_, index) =>
    publicSlideshowImageUrl({ outputId: id, token, index })
  )
  const trace = buildSlideshowWorkflowTrace({
    run: source.run,
    automation: source.automation,
    slideshow: source.slideshow,
    qa: source.qa,
    renderedImageUrls,
  })
  const slideshowUrl = `/share/slideshows/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`

  return <PublicWorkflowTrace trace={trace} slideshowUrl={slideshowUrl} />
}
