import { createPluginOgImage, ogContentType, ogSize } from '@/lib/og'
import { getDirectoryPlugins } from '@/lib/plugins'

export async function generateStaticParams() {
  const plugins = await getDirectoryPlugins()
  return plugins.map((plugin) => ({ id: plugin.id }))
}

export const runtime = 'nodejs'
export const dynamic = 'force-static'
export const size = ogSize
export const contentType = ogContentType

// See the docs opengraph-image for why `alt` is static here.
export const alt = 'Home Screens plugin'

export default async function OgImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return createPluginOgImage(id)
}
