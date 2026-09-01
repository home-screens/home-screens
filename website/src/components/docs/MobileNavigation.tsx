'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Dialog, DialogPanel } from '@headlessui/react'

import { DocsLogomark } from '@/components/docs/DocsLogo'
import { Navigation } from '@/components/docs/Navigation'
import { siteNavLinks } from '@/lib/site-navigation'

function MenuIcon(props: React.ComponentPropsWithoutRef<'svg'>) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="2"
      strokeLinecap="round"
      {...props}
    >
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  )
}

function CloseIcon(props: React.ComponentPropsWithoutRef<'svg'>) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="2"
      strokeLinecap="round"
      {...props}
    >
      <path d="M5 5l14 14M19 5l-14 14" />
    </svg>
  )
}

function CloseOnNavigation({ close }: { close: () => void }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    close()
  }, [pathname, searchParams, close])

  return null
}

export function MobileNavigation() {
  const [isOpen, setIsOpen] = useState(false)
  const close = useCallback(() => setIsOpen(false), [setIsOpen])

  function onLinkClick(event: React.MouseEvent<HTMLAnchorElement>) {
    const link = event.currentTarget
    if (
      link.pathname + link.search + link.hash ===
      window.location.pathname + window.location.search + window.location.hash
    ) {
      close()
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="relative"
        aria-label="Open navigation"
      >
        <MenuIcon className="h-6 w-6 stroke-slate-500" />
      </button>
      <Suspense fallback={null}>
        <CloseOnNavigation close={close} />
      </Suspense>
      <Dialog
        open={isOpen}
        onClose={() => close()}
        className="fixed inset-0 z-50 flex items-start overflow-y-auto bg-slate-900/50 pr-10 backdrop-blur-sm xl:hidden"
        aria-label="Navigation"
      >
        <DialogPanel className="min-h-full w-full max-w-xs bg-white px-4 pt-5 pb-12 sm:px-6 dark:bg-slate-900">
          <div className="flex items-center">
            <button
              type="button"
              onClick={() => close()}
              aria-label="Close navigation"
            >
              <CloseIcon className="h-6 w-6 stroke-slate-500" />
            </button>
            <Link href="/" className="ml-6" aria-label="Home page">
              <DocsLogomark className="h-9 w-9" />
            </Link>
          </div>
          <nav className="mt-5 px-1">
            <ul className="space-y-2">
              {siteNavLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={onLinkClick}
                    className="block text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-300"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="my-4 border-t border-slate-200 lg:hidden dark:border-slate-700" />
          <Navigation className="px-1 lg:hidden" onLinkClick={onLinkClick} />
        </DialogPanel>
      </Dialog>
    </>
  )
}
