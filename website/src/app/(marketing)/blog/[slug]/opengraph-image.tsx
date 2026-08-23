import { createBlogOgImage, ogContentType, ogSize } from '@/lib/og'
import { listSlugs } from '@/lib/markdoc'

export function generateStaticParams() {
  return listSlugs('blog').map((slug) => ({ slug }))
}

export const runtime = 'nodejs'
export const dynamic = 'force-static'
export const size = ogSize
export const contentType = ogContentType

// See the docs opengraph-image for why `alt` is static here.
export const alt = 'Home Screens Blog'

export default async function OgImage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return createBlogOgImage(slug)()
}
