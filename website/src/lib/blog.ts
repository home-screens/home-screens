import fs from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'

export interface BlogPost {
  slug: string
  title: string
  description: string
  date: string
  category: string
  author: string
  image?: string
  href: string
}

interface BlogFrontmatter {
  title?: string
  description?: string
  date?: string
  category?: string
  author?: string
  image?: string
}

const BLOG_DIR = path.join(process.cwd(), 'src', 'app', '(marketing)', 'blog')

function extractFrontmatter(md: string): BlogFrontmatter {
  const match = md.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return {}
  return (yaml.load(match[1]) as BlogFrontmatter) ?? {}
}

export function getAllPosts(): BlogPost[] {
  if (!fs.existsSync(BLOG_DIR)) return []

  const entries = fs.readdirSync(BLOG_DIR, { withFileTypes: true })
  const posts: BlogPost[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const pagePath = path.join(BLOG_DIR, entry.name, 'page.md')
    if (!fs.existsSync(pagePath)) continue

    const md = fs.readFileSync(pagePath, 'utf8')
    const fm = extractFrontmatter(md)

    if (!fm.title || !fm.date) continue

    posts.push({
      slug: entry.name,
      title: fm.title,
      description: fm.description ?? '',
      date: fm.date,
      category: fm.category ?? 'Updates',
      author: fm.author ?? 'Bryan',
      image: fm.image,
      href: `/blog/${entry.name}`,
    })
  }

  return posts.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  )
}

export function getCategories(): string[] {
  const posts = getAllPosts()
  return Array.from(new Set(posts.map((p) => p.category))).sort()
}
