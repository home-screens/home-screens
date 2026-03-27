import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import localFont from 'next/font/local'
import Script from 'next/script'
import clsx from 'clsx'

import { Providers } from '@/app/providers'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

const lexend = localFont({
  src: '../fonts/lexend.woff2',
  display: 'swap',
  variable: '--font-lexend',
})

export const metadata: Metadata = {
  title: {
    template: '%s - Home Screens',
    default: 'Home Screens — Smart Display for Your Home',
  },
  description:
    'An open-source smart display system for Raspberry Pi. 34 modules, visual editor, 5 weather providers. Free forever.',
  openGraph: {
    title: 'Home Screens — Smart Display for Your Home',
    description:
      'An open-source smart display system for Raspberry Pi. 34 modules, visual editor, 5 weather providers.',
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en"
      className={clsx('h-full antialiased', inter.variable, lexend.variable)}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col bg-white dark:bg-slate-900">
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-2NF75R9G5W"
          strategy="afterInteractive"
        />
        <Script id="gtag-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-2NF75R9G5W');
          `}
        </Script>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
