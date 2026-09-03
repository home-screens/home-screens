import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Github,
  Hash,
  Sparkles,
  TrendingUp,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Reveal } from '@/components/Reveal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Container } from '@/components/Container';
import type { ChangelogEntry, ChangelogSection } from '@/lib/changelog';

type SectionMeta = {
  title: ChangelogSection;
  icon: LucideIcon;
  textClass: string;
  dotClass: string;
  ruleClass: string;
};

const SECTIONS: SectionMeta[] = [
  {
    title: 'New',
    icon: Sparkles,
    textClass: 'text-cyan-300',
    dotClass: 'bg-cyan-300',
    ruleClass: 'border-cyan-500/20',
  },
  {
    title: 'Improved',
    icon: TrendingUp,
    textClass: 'text-emerald-300',
    dotClass: 'bg-emerald-300',
    ruleClass: 'border-emerald-500/20',
  },
  {
    title: 'Fixed',
    icon: Wrench,
    textClass: 'text-neutral-300',
    dotClass: 'bg-neutral-400',
    ruleClass: 'border-neutral-500/20',
  },
];

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(`${iso}T00:00:00Z`);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

const DEFAULT_HEADING = (
  <>
    What&apos;s <span className="text-cyan-400">new</span>
  </>
);

const DEFAULT_INTRO =
  'The most recent stable releases, in detail. New modules, editor improvements, infrastructure work, and the bugs we squashed along the way.';

export function Changelog({
  entries,
  hasArchive,
  heading = DEFAULT_HEADING,
  intro = DEFAULT_INTRO,
  backToRecent = false,
}: {
  entries: ChangelogEntry[];
  /** Renders the "Older releases" link to the archive below the timeline. */
  hasArchive: boolean;
  heading?: ReactNode;
  intro?: ReactNode;
  /** Renders a link back to /changelog above the timeline (archive page). */
  backToRecent?: boolean;
}) {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden pt-32 pb-16 sm:pt-40 sm:pb-20">
        <div
          className="absolute inset-0 -z-10"
          style={{
            backgroundImage:
              'radial-gradient(circle, rgba(255,255,255,0.03) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />
        <div className="absolute top-1/2 left-1/2 -z-10 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-500/[0.04] blur-3xl" />

        <Container>
          <Reveal className="mx-auto max-w-3xl text-center" y={20} immediate>
            <Badge color="cyan" className="mb-6">
              Changelog
            </Badge>
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
              {heading}
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-neutral-400">
              {intro}
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <Button
                href="https://github.com/home-screens/home-screens/releases"
                variant="outline"
              >
                <Github className="h-4 w-4" />
                All releases on GitHub
              </Button>
              <Button href="/docs/getting-started">Try Home Screens</Button>
            </div>
          </Reveal>
        </Container>
      </section>

      {/* Timeline */}
      <section className="pb-24 sm:pb-32">
        <Container>
          {backToRecent && (
            <div className="mx-auto mb-10 max-w-3xl">
              <Button href="/changelog" variant="outline">
                <ArrowLeft className="h-4 w-4" />
                Back to recent releases
              </Button>
            </div>
          )}
          {entries.length === 0 ? (
            <p className="mx-auto max-w-2xl text-center text-neutral-500">
              No releases published yet.
            </p>
          ) : (
            <div className="mx-auto max-w-3xl">
              {/* Jump nav */}
              {entries.length > 1 && (
                <nav
                  aria-label="Jump to release"
                  className="mb-10 flex flex-wrap items-center gap-2"
                >
                  <span className="mr-1 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                    Jump to
                  </span>
                  {entries.map((entry) => (
                    <Link
                      key={entry.tag}
                      href={`#${entry.tag}`}
                      className="rounded-full border border-[#222] bg-[#0f0f0f] px-3 py-1 text-xs font-medium text-neutral-300 transition-colors hover:border-cyan-500/40 hover:text-cyan-300 focus-visible:border-cyan-500/40 focus-visible:text-cyan-300 focus-visible:outline-none"
                    >
                      {entry.tag}
                    </Link>
                  ))}
                </nav>
              )}

              {/* Release cards */}
              <div className="space-y-8">
                {entries.map((entry, entryIdx) => (
                  <Reveal key={entry.tag} y={16} margin="-80px" delay={Math.min(entryIdx * 0.06, 0.18)}>
                  <article
                    id={entry.tag}
                    className="scroll-mt-24 rounded-2xl border border-[#222] bg-[#0f0f0f] p-6 sm:p-8"
                    aria-labelledby={`release-${entry.version}`}
                  >
                    <header className="mb-8 flex flex-wrap items-end justify-between gap-3 border-b border-[#222] pb-4">
                      <div className="group flex items-center gap-3">
                        <Badge color="cyan">{entry.tag}</Badge>
                        <h2
                          id={`release-${entry.version}`}
                          className="text-2xl font-semibold tracking-tight text-white sm:text-3xl"
                        >
                          {entry.version}
                        </h2>
                        <Link
                          href={`#${entry.tag}`}
                          aria-label={`Permalink to ${entry.tag}`}
                          className="rounded text-neutral-600 opacity-0 transition-opacity hover:text-cyan-300 focus-visible:opacity-100 focus-visible:outline-none group-hover:opacity-100"
                        >
                          <Hash className="h-4 w-4" aria-hidden />
                        </Link>
                      </div>
                      {entry.date && (
                        <time
                          dateTime={entry.date}
                          className="text-sm text-neutral-500"
                        >
                          {formatDate(entry.date)}
                        </time>
                      )}
                    </header>

                    <div className="space-y-8">
                      {SECTIONS.map(
                        ({
                          title,
                          icon: Icon,
                          textClass,
                          dotClass,
                          ruleClass,
                        }) => {
                          const items = entry.sections[title];
                          if (!items || items.length === 0) return null;
                          return (
                            <section key={title}>
                              <div
                                className={`flex items-center gap-2 border-b pb-2 ${ruleClass}`}
                              >
                                <Icon
                                  className={`h-4 w-4 ${textClass}`}
                                  aria-hidden
                                />
                                <h3
                                  className={`text-xs font-semibold uppercase tracking-wider ${textClass}`}
                                >
                                  {title}
                                </h3>
                              </div>
                              <ul className="mt-4 space-y-3">
                                {items.map((item, i) => (
                                  <li
                                    key={i}
                                    className="flex gap-3 text-sm leading-relaxed text-neutral-300"
                                  >
                                    <span
                                      className={`mt-2 h-1 w-1 shrink-0 rounded-full ${dotClass}`}
                                      aria-hidden
                                    />
                                    <span>{item}</span>
                                  </li>
                                ))}
                              </ul>
                            </section>
                          );
                        },
                      )}
                    </div>
                  </article>
                  </Reveal>
                ))}
              </div>

              {/* Older releases */}
              {hasArchive && (
                <div className="mt-12 flex justify-center">
                  <Button href="/changelog/archive" variant="outline">
                    Older releases
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </Container>
      </section>
    </>
  );
}
