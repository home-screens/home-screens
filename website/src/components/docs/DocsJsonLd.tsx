'use client'

import { usePathname } from 'next/navigation'

import { navigation } from '@/lib/docs-navigation'

const BASE_URL = 'https://homescreens.dev'

const HS_ORG = {
  '@type': 'Organization',
  name: 'Home Screens',
  url: BASE_URL,
}

export function DocsJsonLd({ title }: { title?: string }) {
  const pathname = usePathname()

  const link = navigation
    .flatMap((section) => section.links)
    .find((link) => link.href === pathname)

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

  return (
    <>
      {jsonLd.map((schema, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}
    </>
  )
}
