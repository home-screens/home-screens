'use client'

import { usePathname } from 'next/navigation'

import { JsonLd } from '@/components/JsonLd'
import { findDocsPage } from '@/lib/docs-navigation'

const BASE_URL = 'https://homescreens.dev'

const HS_ORG = {
  '@type': 'Organization',
  name: 'Home Screens',
  url: BASE_URL,
}

export function DocsJsonLd({ title }: { title?: string }) {
  const pathname = usePathname()

  const { link } = findDocsPage(pathname)

  const pageTitle = title || link?.title || 'Documentation'
  const pageUrl = `${BASE_URL}${pathname}`

  const breadcrumbItems = [
    { '@type': 'ListItem', position: 1, name: 'Home', item: BASE_URL },
    {
      '@type': 'ListItem',
      position: 2,
      name: 'Documentation',
      item: `${BASE_URL}/docs`,
    },
  ]

  if (pathname !== '/docs') {
    breadcrumbItems.push({
      '@type': 'ListItem',
      position: 3,
      name: pageTitle,
      item: pageUrl,
    })
  }

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: breadcrumbItems,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: pageTitle,
      image: `${BASE_URL}/images/og-home.jpg`,
      author: HS_ORG,
      publisher: HS_ORG,
      mainEntityOfPage: { '@type': 'WebPage', '@id': pageUrl },
    },
  ]

  return <JsonLd schema={jsonLd} />
}
