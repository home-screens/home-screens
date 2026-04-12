import { type Node } from '@markdoc/markdoc'

import { DocsHeader } from '@/components/docs/DocsHeader'
import { DocsJsonLd } from '@/components/docs/DocsJsonLd'
import { PrevNextLinks } from '@/components/docs/PrevNextLinks'
import { Prose } from '@/components/docs/Prose'
import { TableOfContents } from '@/components/docs/TableOfContents'
import { collectSections } from '@/lib/sections'

export function DocsLayout({
  children,
  frontmatter: { title },
  nodes,
}: {
  children: React.ReactNode
  frontmatter: { title?: string }
  nodes: Array<Node>
}) {
  const tableOfContents = collectSections(nodes)

  return (
    <>
      <DocsJsonLd title={title} />
      <div className="max-w-2xl min-w-0 flex-auto px-4 py-16 lg:max-w-none lg:pr-0 lg:pl-8 xl:px-16">
        <article>
          <DocsHeader title={title} />
          <Prose>{children}</Prose>
        </article>
        <PrevNextLinks />
      </div>
      <TableOfContents tableOfContents={tableOfContents} />
    </>
  )
}
