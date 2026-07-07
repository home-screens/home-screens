'use client'

import { usePathname } from 'next/navigation'

import { findDocsPage } from '@/lib/docs-navigation'

export function DocsHeader({ title }: { title?: string }) {
  const pathname = usePathname()
  const { section } = findDocsPage(pathname)

  if (!title && !section) {
    return null
  }

  return (
    <header className="mb-9 space-y-1">
      {section && (
        <p className="font-display text-sm font-medium text-sky-500">
          {section.title}
        </p>
      )}
      {title && (
        <h1 className="font-display text-3xl tracking-tight text-slate-900 dark:text-white">
          {title}
        </h1>
      )}
    </header>
  )
}
