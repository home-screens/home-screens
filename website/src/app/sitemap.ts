import type { MetadataRoute } from 'next'
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { getAllPosts } from '@/lib/blog'
import { navigation } from '@/lib/docs-navigation'
import { getChangelog, RECENT_ENTRY_LIMIT } from '@/lib/changelog'
import { getDirectoryPlugins } from '@/lib/plugins'

export const dynamic = 'force-static'

const APP_DIR = path.join(process.cwd(), 'src', 'app')
const CONTENT_DIR = path.join(process.cwd(), 'content')

function getFileLastModified(filePath: string): Date {
  try {
    const stdout = execSync(`git log -1 --format=%aI -- "${filePath}"`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    })
    const iso = stdout.trim()
    if (iso) return new Date(iso)
  } catch {}
  try {
    return fs.statSync(filePath).mtime
  } catch {}
  return new Date()
}

function docPageLastModified(href: string): Date {
  const slug = href === '/docs' ? 'index' : href.replace('/docs/', '')
  return getFileLastModified(path.join(CONTENT_DIR, 'docs', `${slug}.md`))
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://homescreens.dev'
  const plugins = await getDirectoryPlugins()
  const pluginsLastMod = plugins.reduce<Date>(
    (latest, plugin) =>
      plugin.updatedAt && new Date(plugin.updatedAt) > latest ? new Date(plugin.updatedAt) : latest,
    new Date(0),
  )

  let changelogLastMod = new Date()
  let archivedEntries: ReturnType<typeof getChangelog> = []
  try {
    const entries = getChangelog()
    if (entries[0]?.date) changelogLastMod = new Date(entries[0].date)
    archivedEntries = entries.slice(RECENT_ENTRY_LIMIT)
  } catch {}

  // The archive only holds releases pushed off the main changelog, so it stays
  // out of the sitemap until there is something on it.
  const archiveEntry =
    archivedEntries.length > 0
      ? [
          {
            url: `${baseUrl}/changelog/archive`,
            lastModified: archivedEntries[0]?.date
              ? new Date(archivedEntries[0].date)
              : new Date(),
            changeFrequency: 'yearly' as const,
            priority: 0.7,
          },
        ]
      : []

  const docHrefs = navigation.flatMap((section) =>
    section.links.map((link) => link.href),
  )

  const docIndexHref = '/docs'
  const subPages = Array.from(
    new Set(docHrefs.filter((href) => href !== docIndexHref)),
  )

  return [
    {
      url: baseUrl,
      lastModified: getFileLastModified(
        path.join(APP_DIR, '(marketing)', 'page.tsx'),
      ),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${baseUrl}/vs`,
      lastModified: getFileLastModified(
        path.join(APP_DIR, '(marketing)', 'vs', 'page.tsx'),
      ),
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/changelog`,
      lastModified: changelogLastMod,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/plugins`,
      lastModified: pluginsLastMod,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    ...plugins.map((plugin) => ({
      url: `${baseUrl}/plugins/${plugin.id}`,
      lastModified: plugin.updatedAt ? new Date(plugin.updatedAt) : pluginsLastMod,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),
    ...archiveEntry,
    {
      url: `${baseUrl}${docIndexHref}`,
      lastModified: docPageLastModified(docIndexHref),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    ...subPages.map((href) => ({
      url: `${baseUrl}${href}`,
      lastModified: docPageLastModified(href),
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),
    {
      url: `${baseUrl}/blog`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.9,
    },
    ...getAllPosts().map((post) => ({
      url: `${baseUrl}${post.href}`,
      lastModified: getFileLastModified(
        path.join(CONTENT_DIR, 'blog', `${post.slug}.md`),
      ),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
    ...['privacy', 'terms'].map((page) => ({
      url: `${baseUrl}/${page}`,
      lastModified: getFileLastModified(
        path.join(CONTENT_DIR, 'legal', `${page}.md`),
      ),
      changeFrequency: 'yearly' as const,
      priority: 0.3,
    })),
  ]
}
