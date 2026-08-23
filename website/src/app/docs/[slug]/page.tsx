import { type Metadata } from 'next'

import { listSlugs, metadataFor, renderMarkdoc } from '@/lib/markdoc'

export function generateStaticParams() {
  return listSlugs('docs').map((slug) => ({ slug }))
}

// Every docs page is known at build time, so anything else is a 404 rather
// than an attempted render.
export const dynamicParams = false

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  return metadataFor('docs', slug)
}

export default async function DocsPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return renderMarkdoc('docs', slug).rendered
}
