import { createDocsOgImage, ogContentType, ogSize } from '@/lib/og'
import { listSlugs } from '@/lib/markdoc'

export function generateStaticParams() {
  return listSlugs('docs').map((slug) => ({ slug }))
}

export const runtime = 'nodejs'
export const dynamic = 'force-static'
export const size = ogSize
export const contentType = ogContentType

// `alt` has to be a static export, so it cannot name the individual page.
// The rendered image still shows the page's own title; only this fallback
// string is generic. Deriving a per-page alt would mean exporting
// generateImageMetadata, which cannot coexist with generateStaticParams -
// Next generates its own generateStaticParams from it and the two collide.
export const alt = 'Home Screens Documentation'

export default async function OgImage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return createDocsOgImage(slug)()
}
