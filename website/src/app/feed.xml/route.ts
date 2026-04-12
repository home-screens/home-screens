import { getAllPosts } from '@/lib/blog'

export const dynamic = 'force-static'

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function GET() {
  const posts = getAllPosts()
  const baseUrl = 'https://homescreens.dev'

  const items = posts
    .map(
      (post) => `    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${baseUrl}${post.href}</link>
      <guid>${baseUrl}${post.href}</guid>
      <description>${escapeXml(post.description)}</description>
      <pubDate>${new Date(post.date + 'T00:00:00Z').toUTCString()}</pubDate>
      <category>${escapeXml(post.category)}</category>
    </item>`,
    )
    .join('\n')

  const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Home Screens Blog</title>
    <link>${baseUrl}/blog</link>
    <description>News, guides, and updates from the Home Screens project.</description>
    <language>en-us</language>
    <lastBuildDate>${posts[0] ? new Date(posts[0].date + 'T00:00:00Z').toUTCString() : new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${baseUrl}/feed.xml" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>`

  return new Response(feed, {
    headers: {
      'Content-Type': 'application/xml',
    },
  })
}
