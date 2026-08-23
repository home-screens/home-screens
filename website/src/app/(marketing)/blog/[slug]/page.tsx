import { type Metadata } from 'next'

import { listSlugs, metadataFor, renderMarkdoc } from '@/lib/markdoc'

export function generateStaticParams() {
  return listSlugs('blog').map((slug) => ({ slug }))
}

export const dynamicParams = false

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  return metadataFor('blog', slug)
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return renderMarkdoc('blog', slug).rendered
}
