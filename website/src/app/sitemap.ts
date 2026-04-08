import type { MetadataRoute } from 'next'
import { navigation } from '@/lib/docs-navigation'

export const dynamic = 'force-static'

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://homescreens.dev'
  const lastModified = new Date()

  // Derive the doc list from the sidebar navigation so the sitemap and
  // the sidebar can never disagree about which pages exist. Adding a doc
  // to docs-navigation.ts auto-publishes it here on the next build — no
  // second hardcoded list to keep in sync.
  const docHrefs = navigation.flatMap((section) =>
    section.links.map((link) => link.href),
  )

  // The docs index ('/docs') is special-cased with a higher priority than
  // individual pages, so split it out and de-dupe it from the rest.
  const docIndexHref = '/docs'
  const subPages = Array.from(
    new Set(docHrefs.filter((href) => href !== docIndexHref)),
  )

  return [
    {
      url: baseUrl,
      lastModified,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${baseUrl}${docIndexHref}`,
      lastModified,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    ...subPages.map((href) => ({
      url: `${baseUrl}${href}`,
      lastModified,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),
  ]
}
