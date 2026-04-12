import type { Metadata } from 'next';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { Changelog } from '@/components/Changelog';
import { getChangelog, RECENT_ENTRY_LIMIT } from '@/lib/changelog';

export const metadata: Metadata = {
  title: {
    absolute: 'Changelog — Home Screens',
  },
  description:
    'Release history for Home Screens — every stable version, the features it shipped, what improved, and what was fixed.',
  alternates: {
    canonical: 'https://homescreens.dev/changelog',
  },
  openGraph: {
    title: 'Home Screens Changelog',
    description:
      'Every stable release of Home Screens — the features, improvements, and fixes that shipped.',
    url: 'https://homescreens.dev/changelog',
    type: 'article',
  },
  twitter: {
    title: 'Home Screens Changelog',
    description:
      'Every stable release of Home Screens — the features, improvements, and fixes that shipped.',
  },
};

export default function ChangelogPage() {
  const allEntries = getChangelog();
  const entries = allEntries.slice(0, RECENT_ENTRY_LIMIT);
  const hasArchive = allEntries.length > RECENT_ENTRY_LIMIT;
  const latest = entries[0];
  const earliest = entries[entries.length - 1];

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: 'Home Screens Changelog',
    description:
      'Release history for Home Screens — every stable version, the features it shipped, what improved, and what was fixed.',
    mainEntityOfPage: 'https://homescreens.dev/changelog',
    author: {
      '@type': 'Organization',
      name: 'Home Screens',
      url: 'https://homescreens.dev',
    },
    ...(earliest?.date ? { datePublished: earliest.date } : {}),
    ...(latest?.date ? { dateModified: latest.date } : {}),
  };

  return (
    <>
      <Header />
      <main>
        <Changelog entries={entries} hasArchive={hasArchive} />
      </main>
      <Footer />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </>
  );
}
