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
  metadataBase: new URL('https://homescreens.dev'),
  title: {
    template: '%s — Home Screens',
    default: 'Home Screens — Smart Display for Your Home',
  },
  description:
    'An open-source smart display system for Raspberry Pi. 38 built-in modules, drag-and-drop editor, plugin system. A free, self-hosted alternative to MagicMirror and Dakboard.',
  openGraph: {
    siteName: 'Home Screens',
    type: 'website',
    images: [
      {
        url: '/images/og-home.jpg',
        width: 1200,
        height: 630,
        alt: 'Home Screens — open-source smart display with drag-and-drop editor',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'SoftwareApplication',
              name: 'Home Screens',
              description:
                'An open-source smart display system for Raspberry Pi with 38 built-in modules, a drag-and-drop visual editor, and a plugin system.',
              applicationCategory: 'UtilitiesApplication',
              operatingSystem: 'Linux',
              url: 'https://homescreens.dev',
              author: {
                '@type': 'Organization',
                name: 'Home Screens',
                url: 'https://homescreens.dev',
              },
              softwareVersion: '1.1.0',
              datePublished: '2026-03-07',
              dateModified: '2026-04-11',
              downloadUrl:
                'https://github.com/home-screens/home-screens/releases',
              softwareRequirements: 'Raspberry Pi 4 or 5, 2 GB+ RAM',
              screenshot: [
                'https://homescreens.dev/images/display-1.jpg',
                'https://homescreens.dev/images/display-2.jpg',
                'https://homescreens.dev/images/display-3.jpg',
                'https://homescreens.dev/images/display-4.jpg',
                'https://homescreens.dev/images/display-5.jpg',
                'https://homescreens.dev/images/display-6.jpg',
              ],
              offers: {
                '@type': 'Offer',
                price: '0',
                priceCurrency: 'USD',
              },
              license: 'https://opensource.org/licenses/MIT',
            }),
          }}
        />
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
