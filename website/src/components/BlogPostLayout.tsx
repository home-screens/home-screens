import { type Node } from '@markdoc/markdoc'
import Link from 'next/link'

import { Prose } from '@/components/docs/Prose'
import { TableOfContents } from '@/components/docs/TableOfContents'
import { collectSections } from '@/lib/sections'
import {
  buildArticleSchema,
  buildBreadcrumbSchema,
  buildFaqSchema,
  extractFaqEntries,
} from '@/lib/structured-data'

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export function BlogPostLayout({
  children,
  frontmatter,
  nodes,
}: {
  children: React.ReactNode
  frontmatter: Record<string, string | undefined>
  nodes: Array<Node>
}) {
  const tableOfContents = collectSections(nodes)
  const { title, date, category, author, image, description, slug } =
    frontmatter

  const structuredData: Array<Record<string, unknown>> = []
  if (title && date && slug) {
    structuredData.push(
      buildArticleSchema({
        title,
        description: description ?? '',
        date,
        author: author ?? 'Bryan',
        image,
        slug,
      }),
    )
    structuredData.push(buildBreadcrumbSchema(title, slug))
    const faq = buildFaqSchema(extractFaqEntries(nodes))
    if (faq) structuredData.push(faq)
  }

  return (
    <div className="relative mx-auto flex w-full max-w-7xl justify-center px-4 sm:px-6 lg:px-8">
      {structuredData.map((data, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
        />
      ))}
      <div className="min-w-0 max-w-3xl flex-auto py-16 xl:pr-16">
        <article>
          <header className="mb-10">
            <div className="flex items-center gap-x-4 text-sm">
              {date && (
                <time dateTime={date} className="text-neutral-400">
                  {formatDate(date)}
                </time>
              )}
              {category && (
                <span className="rounded-full bg-white/5 px-3 py-1 font-medium text-neutral-300 ring-1 ring-white/10">
                  {category}
                </span>
              )}
            </div>
            {title && (
              <h1 className="mt-6 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                {title}
              </h1>
            )}
            {author && (
              <p className="mt-4 text-base text-neutral-400">
                By {author}
              </p>
            )}
          </header>

          {image && (
            <div className="mb-10">
              <img
                src={image}
                alt=""
                className="w-full rounded-2xl bg-neutral-800"
              />
            </div>
          )}

          <Prose className="dark:text-neutral-300 dark:prose-headings:text-white dark:prose-a:text-cyan-400 dark:prose-strong:text-white dark:prose-code:text-white">
            {children}
          </Prose>
        </article>

        <div className="mt-16 border-t border-white/10 pt-8">
          <Link
            href="/blog"
            className="text-sm font-semibold text-cyan-400 hover:text-cyan-300"
          >
            &larr; Back to blog
          </Link>
        </div>
      </div>

      <TableOfContents tableOfContents={tableOfContents} />
    </div>
  )
}
