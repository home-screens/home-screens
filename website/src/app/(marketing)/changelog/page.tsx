import type { Metadata } from 'next';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { Changelog } from '@/components/Changelog';
import { JsonLd } from '@/components/JsonLd';
import { getChangelog, RECENT_ENTRY_LIMIT } from '@/lib/changelog';
import { buildArticleSchema } from '@/lib/structured-data';

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

  const jsonLd = buildArticleSchema({
    title: 'Home Screens Changelog',
    description:
      'Release history for Home Screens — every stable version, the features it shipped, what improved, and what was fixed.',
    path: '/changelog',
    datePublished: earliest?.date ?? undefined,
    dateModified: latest?.date ?? undefined,
    author: {
      type: 'organization',
      name: 'Home Screens',
      url: 'https://homescreens.dev',
    },
    includePublisher: false,
  });

  return (
    <>
      <Header />
      <main>
        <Changelog entries={entries} hasArchive={hasArchive} />
      </main>
      <Footer />
      <JsonLd schema={jsonLd} />
    </>
  );
}
