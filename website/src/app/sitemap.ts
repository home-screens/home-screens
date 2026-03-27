import type { MetadataRoute } from 'next'

export const dynamic = 'force-static'

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://homescreens.dev'

  const docs = [
    'getting-started',
    'modules',
    'editor',
    'configuration',
    'raspberry-pi',
    'plugins',
    'profiles',
    'backgrounds',
    'remote-control',
    'networking',
    'api',
    'development',
    'troubleshooting',
    'faq',
  ]

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${baseUrl}/docs`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    ...docs.map((slug) => ({
      url: `${baseUrl}/docs/${slug}`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),
  ]
}
