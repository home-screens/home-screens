import type { Metadata } from 'next';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { Changelog } from '@/components/Changelog';
import { JsonLd } from '@/components/JsonLd';
import { getChangelog, RECENT_ENTRY_LIMIT } from '@/lib/changelog';
import { buildArticleSchema } from '@/lib/structured-data';

const DESCRIPTION =
  'Older stable releases of Home Screens, kept in full — the features they shipped, what improved, and what was fixed.';

export const metadata: Metadata = {
  title: {
    absolute: 'Older releases — Home Screens',
  },
  description: DESCRIPTION,
  alternates: {
    canonical: 'https://homescreens.dev/changelog/archive',
  },
  openGraph: {
    title: 'Home Screens Older Releases',
    description: DESCRIPTION,
    url: 'https://homescreens.dev/changelog/archive',
    type: 'article',
  },
  twitter: {
    title: 'Home Screens Older Releases',
    description: DESCRIPTION,
  },
};

export default function ChangelogArchivePage() {
  const entries = getChangelog().slice(RECENT_ENTRY_LIMIT);
  const newest = entries[0];
  const oldest = entries[entries.length - 1];

  const jsonLd = buildArticleSchema({
    title: 'Home Screens Older Releases',
    description: DESCRIPTION,
    path: '/changelog/archive',
    datePublished: oldest?.date ?? undefined,
    dateModified: newest?.date ?? undefined,
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
        <Changelog
          entries={entries}
          hasArchive={false}
          backToRecent
          heading={
            <>
              Older <span className="text-cyan-400">releases</span>
            </>
          }
          intro={
            oldest && newest
              ? `Everything before the ten most recent releases, from ${oldest.version} up to ${newest.version}.`
              : 'Everything before the ten most recent releases.'
          }
        />
      </main>
      <Footer />
      <JsonLd schema={jsonLd} />
    </>
  );
}
