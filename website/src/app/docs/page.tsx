import { type Metadata } from 'next'

import { metadataFor, renderMarkdoc } from '@/lib/markdoc'

export async function generateMetadata(): Promise<Metadata> {
  return metadataFor('docs', 'index')
}

export default async function DocsIndexPage() {
  return renderMarkdoc('docs', 'index').rendered
}
