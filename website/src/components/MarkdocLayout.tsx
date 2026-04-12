import { type Node } from '@markdoc/markdoc'

import { BlogPostLayout } from '@/components/BlogPostLayout'
import { DocsLayout } from '@/components/docs/DocsLayout'

export function MarkdocLayout({
  children,
  frontmatter,
  nodes,
}: {
  children: React.ReactNode
  frontmatter: Record<string, string | undefined>
  nodes: Array<Node>
}) {
  if (frontmatter?.layout === 'blog') {
    return (
      <BlogPostLayout frontmatter={frontmatter} nodes={nodes}>
        {children}
      </BlogPostLayout>
    )
  }

  return (
    <DocsLayout frontmatter={frontmatter} nodes={nodes}>
      {children}
    </DocsLayout>
  )
}
