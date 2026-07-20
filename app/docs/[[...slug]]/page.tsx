import type { Metadata } from "next"
import { notFound } from "next/navigation"
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from "fumadocs-ui/layouts/docs/page"
import { createRelativeLink } from "fumadocs-ui/mdx"

import { getMDXComponents } from "@/mdx-components"
import { docsSource } from "@/lib/docs-source"

export default async function DocumentationPage({
  params,
}: PageProps<"/docs/[[...slug]]">) {
  const { slug } = await params
  const page = docsSource.getPage(slug)

  if (!page) notFound()

  const Content = page.data.body

  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <Content
          components={getMDXComponents({
            a: createRelativeLink(docsSource, page),
          })}
        />
      </DocsBody>
    </DocsPage>
  )
}

export function generateStaticParams() {
  return docsSource.generateParams()
}

export async function generateMetadata({
  params,
}: PageProps<"/docs/[[...slug]]">): Promise<Metadata> {
  const { slug } = await params
  const page = docsSource.getPage(slug)

  if (!page) notFound()

  return {
    title: page.data.title,
    description: page.data.description,
  }
}
