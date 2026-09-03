import { Check, X, Minus, Github, Cloud, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Container } from '@/components/Container';
import { Reveal } from '@/components/Reveal';
import { MODULE_COUNT, WEATHER_PROVIDER_COUNT } from '@/lib/stats';

type Cell =
  | { kind: 'yes'; label?: string }
  | { kind: 'no'; label?: string }
  | { kind: 'partial'; label: string }
  | { kind: 'text'; label: string };

type Row = {
  feature: string;
  note?: string;
  magicMirror: Cell;
  dakboard: Cell;
  homeScreens: Cell;
};

type Group = {
  title: string;
  rows: Row[];
};

const groups: Group[] = [
  {
    title: 'Pricing & licensing',
    rows: [
      {
        feature: 'Price',
        magicMirror: { kind: 'text', label: 'Free' },
        dakboard: { kind: 'text', label: 'Free for 1 preset screen; from $5/mo' },
        homeScreens: { kind: 'text', label: 'Free' },
      },
      {
        feature: 'License',
        magicMirror: { kind: 'text', label: 'MIT' },
        dakboard: { kind: 'text', label: 'Proprietary' },
        homeScreens: { kind: 'text', label: 'MIT' },
      },
      {
        feature: 'Open source',
        magicMirror: { kind: 'yes' },
        dakboard: { kind: 'no' },
        homeScreens: { kind: 'yes' },
      },
      {
        feature: 'No account required',
        magicMirror: { kind: 'yes' },
        dakboard: { kind: 'no' },
        homeScreens: { kind: 'yes' },
      },
    ],
  },
  {
    title: 'Editor experience',
    rows: [
      {
        feature: 'Visual drag-and-drop editor',
        magicMirror: { kind: 'no', label: 'config.js file' },
        dakboard: { kind: 'yes' },
        homeScreens: { kind: 'yes' },
      },
      {
        feature: 'Live preview while editing',
        magicMirror: { kind: 'no' },
        dakboard: { kind: 'yes' },
        homeScreens: { kind: 'yes' },
      },
      {
        feature: 'Edit without SSH / terminal',
        magicMirror: { kind: 'no' },
        dakboard: { kind: 'yes' },
        homeScreens: { kind: 'yes' },
      },
      {
        feature: 'Portrait layouts native',
        note: 'Designed for 1080×1920, not a rotated desktop',
        magicMirror: { kind: 'partial', label: 'CSS rotate' },
        dakboard: { kind: 'yes' },
        homeScreens: { kind: 'yes' },
      },
    ],
  },
  {
    title: 'Hosting & data',
    rows: [
      {
        feature: 'Self-hosted',
        magicMirror: { kind: 'yes' },
        dakboard: { kind: 'no' },
        homeScreens: { kind: 'yes' },
      },
      {
        feature: 'Runs offline',
        note: 'No cloud round-trip to render the display',
        magicMirror: { kind: 'yes' },
        dakboard: { kind: 'no' },
        homeScreens: { kind: 'yes' },
      },
      {
        feature: 'Data storage',
        magicMirror: { kind: 'text', label: 'Local files' },
        dakboard: { kind: 'text', label: 'Cloud' },
        homeScreens: { kind: 'text', label: 'Local JSON' },
      },
      {
        feature: 'No PII telemetry',
        note: 'Home Screens collects anonymous usage metrics only — no personally identifiable information, and you can disable it entirely in settings',
        magicMirror: { kind: 'yes' },
        dakboard: { kind: 'no' },
        homeScreens: { kind: 'yes' },
      },
    ],
  },
  {
    title: 'Modules & content',
    rows: [
      {
        feature: 'Built-in modules',
        note: 'Modules that ship with a default install, before adding anything',
        magicMirror: { kind: 'text', label: '7' },
        dakboard: { kind: 'text', label: 'Not published' },
        homeScreens: { kind: 'text', label: String(MODULE_COUNT) },
      },
      {
        feature: 'Community modules',
        note: 'MagicMirror has by far the largest ecosystem of any option here',
        magicMirror: { kind: 'text', label: 'Hundreds' },
        dakboard: { kind: 'text', label: '—' },
        homeScreens: { kind: 'text', label: 'Plugin SDK' },
      },
      {
        feature: 'Weather providers',
        note: 'Providers supported by the built-in weather module',
        magicMirror: { kind: 'text', label: '12' },
        dakboard: { kind: 'text', label: '4' },
        homeScreens: { kind: 'text', label: String(WEATHER_PROVIDER_COUNT) },
      },
    ],
  },
  {
    title: 'Remote control & multi-display',
    rows: [
      {
        feature: 'Phone remote control',
        magicMirror: { kind: 'partial', label: 'Plugin' },
        dakboard: { kind: 'yes' },
        homeScreens: { kind: 'yes' },
      },
      {
        feature: 'Remote wake / sleep',
        magicMirror: { kind: 'partial', label: 'Plugin' },
        dakboard: { kind: 'yes' },
        homeScreens: { kind: 'yes' },
      },
      {
        feature: 'Multi-display from one hub',
        note: 'Home Screens: unlimited displays from one Pi install, no per-display fee',
        magicMirror: { kind: 'no' },
        dakboard: { kind: 'partial', label: 'Per-screen pricing' },
        homeScreens: { kind: 'yes' },
      },
      {
        feature: 'Profiles + time-based auto-switch',
        magicMirror: { kind: 'partial', label: 'Plugin' },
        dakboard: { kind: 'partial', label: 'Plus tier' },
        homeScreens: { kind: 'yes' },
      },
    ],
  },
  {
    title: 'Extensibility & updates',
    rows: [
      {
        feature: 'Custom modules without forking',
        magicMirror: { kind: 'yes' },
        dakboard: { kind: 'no' },
        homeScreens: { kind: 'yes' },
      },
      {
        feature: 'Plugin sandbox / proxy',
        note: 'Plugins can fetch APIs without leaking keys',
        magicMirror: { kind: 'no' },
        dakboard: { kind: 'no' },
        homeScreens: { kind: 'yes' },
      },
      {
        feature: 'One-click OTA updates',
        magicMirror: { kind: 'partial', label: 'git pull' },
        dakboard: { kind: 'yes' },
        homeScreens: { kind: 'yes' },
      },
      {
        feature: 'Auto-backup before upgrade',
        magicMirror: { kind: 'no' },
        dakboard: { kind: 'text', label: 'N/A' },
        homeScreens: { kind: 'yes' },
      },
    ],
  },
];

const positioning = [
  {
    name: 'MagicMirror',
    tagline: 'The classic',
    copy: 'Open source and free, with the biggest community module ecosystem on the planet. You will edit a config.js file and probably touch npm. Landscape-first.',
    accent: 'neutral' as const,
  },
  {
    name: 'Dakboard',
    tagline: 'The polished one',
    copy: 'Beautiful drag-and-drop editor, sign up and point any screen at a URL. Your photos, calendars, and settings live in their cloud. Subscription, starts at $5/mo.',
    accent: 'neutral' as const,
  },
  {
    name: 'Home Screens',
    tagline: 'The middle path',
    copy: `Open source + visual editor. Runs entirely on your Pi — no account, no cloud. ${MODULE_COUNT} built-in modules, a plugin SDK, and remote control from your phone.`,
    accent: 'cyan' as const,
  },
];

const tradeoffs = [
  {
    icon: Github,
    title: 'Pick MagicMirror if…',
    items: [
      'You want the largest community module catalog of any smart-mirror project.',
      'You are comfortable editing a Node config file.',
      'Your display is landscape and DIY is half the fun.',
    ],
  },
  {
    icon: Cloud,
    title: 'Pick Dakboard if…',
    items: [
      'You do not want to maintain a Pi or self-host anything.',
      'You want a hosted dashboard you manage from any browser, anywhere.',
      'A monthly subscription is a fair trade for zero-touch setup.',
    ],
  },
  {
    icon: Sparkles,
    title: 'Pick Home Screens if…',
    items: [
      'You want Dakboard-style editing without the cloud.',
      `You want ${MODULE_COUNT} built-in modules out of the box.`,
      'You want dedicated fullscreen calendar, chore, meal, and photo-frame modes — not just shrunk-down widgets.',
      'Portrait or landscape, you want something the family will use daily.',
      'You want a plugin SDK and multi-display from one hub.',
    ],
  },
];

function StatusCell({ cell, highlight }: { cell: Cell; highlight?: boolean }) {
  const textTone = highlight ? 'text-cyan-100' : 'text-neutral-300';
  const mutedTone = highlight ? 'text-cyan-300/70' : 'text-neutral-500';

  if (cell.kind === 'yes') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 text-sm ${textTone}`}
      >
        <Check
          className={`h-4 w-4 ${highlight ? 'text-cyan-400' : 'text-green-400/80'}`}
          aria-hidden="true"
        />
        <span>{cell.label ?? 'Yes'}</span>
      </span>
    );
  }
  if (cell.kind === 'no') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 text-sm ${mutedTone}`}
      >
        <X className="h-4 w-4 text-neutral-600" aria-hidden="true" />
        <span>{cell.label ?? 'No'}</span>
      </span>
    );
  }
  if (cell.kind === 'partial') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 text-sm ${highlight ? 'text-cyan-100' : 'text-amber-200/80'}`}
      >
        <Minus
          className={`h-4 w-4 ${highlight ? 'text-cyan-400' : 'text-amber-400/70'}`}
          aria-hidden="true"
        />
        <span>{cell.label}</span>
      </span>
    );
  }
  return (
    <span className={`font-mono text-sm ${textTone}`}>{cell.label}</span>
  );
}

function ComparisonRow({ row, delay }: { row: Row; delay: number }) {
  return (
    <Reveal
      delay={delay}
      y={6}
      className="grid grid-cols-[1.4fr_1fr_1fr_1.1fr] items-start gap-4 border-b border-[#1a1a1a] px-4 py-4 last:border-b-0 sm:px-6"
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-neutral-200">{row.feature}</p>
        {row.note && (
          <p className="mt-0.5 text-xs leading-relaxed text-neutral-500">
            {row.note}
          </p>
        )}
      </div>
      <div>
        <StatusCell cell={row.magicMirror} />
      </div>
      <div>
        <StatusCell cell={row.dakboard} />
      </div>
      <div className="relative -mx-3 rounded-md bg-cyan-500/[0.04] px-3 py-0.5">
        <StatusCell cell={row.homeScreens} highlight />
      </div>
    </Reveal>
  );
}

export function VsComparison() {
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
              Comparison
            </Badge>
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Home Screens
              <span className="text-neutral-500"> vs </span>
              MagicMirror
              <span className="text-neutral-500"> vs </span>
              <span className="text-cyan-400">Dakboard</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-neutral-400">
              Three ways to run a smart display on a Raspberry Pi. One is free
              and DIY. One is polished but lives in the cloud. One tries to
              give you both. Here is an honest look at where each one wins.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <Button href="#matrix">See the full matrix</Button>
              <Button href="/docs/getting-started" variant="outline">
                Try Home Screens
              </Button>
            </div>
          </Reveal>
        </Container>
      </section>

      {/* Positioning trio */}
      <section className="py-12 sm:py-16">
        <Container>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {positioning.map((item, i) => (
              <Reveal
                key={item.name}
                delay={i * 0.06}
                className={
                  item.accent === 'cyan'
                    ? 'rounded-xl border border-cyan-500/30 bg-cyan-500/[0.04] p-6'
                    : 'rounded-xl border border-[#222] bg-[#161616] p-6'
                }
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs uppercase tracking-wider text-neutral-500">
                    {item.tagline}
                  </p>
                  {item.accent === 'cyan' && (
                    <Badge color="cyan">This site</Badge>
                  )}
                </div>
                <p
                  className={
                    item.accent === 'cyan'
                      ? 'mt-2 text-xl font-semibold text-cyan-100'
                      : 'mt-2 text-xl font-semibold text-white'
                  }
                >
                  {item.name}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-neutral-400">
                  {item.copy}
                </p>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      {/* Comparison matrix */}
      <section id="matrix" className="py-16 sm:py-20">
        <Container>
          <div className="mb-10 max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Feature by feature
            </h2>
            <p className="mt-3 text-neutral-400">
              Every claim here maps to something you can see in the docs or in
              the source. Corrections welcome — open an issue on GitHub.
            </p>
          </div>

          <div className="overflow-x-auto overflow-y-hidden">
            <div className="min-w-[720px] rounded-2xl border border-[#222] bg-[#0f0f0f]">
              {/* Header row */}
              <div className="grid grid-cols-[1.4fr_1fr_1fr_1.1fr] items-end gap-4 rounded-t-2xl border-b border-[#222] bg-[#0f0f0f] px-4 py-4 sm:px-6">
                <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Feature
                </div>
                <div className="text-sm font-semibold text-neutral-300">
                  MagicMirror
                </div>
                <div className="text-sm font-semibold text-neutral-300">
                  Dakboard
                </div>
                <div className="-mx-3 rounded-md bg-cyan-500/10 px-3 py-1 text-sm font-semibold text-cyan-300">
                  Home Screens
                </div>
              </div>

              {/* Groups */}
              {groups.map((group) => (
                <div key={group.title}>
                  <div className="border-b border-[#1a1a1a] bg-[#0a0a0a] px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 sm:px-6">
                    {group.title}
                  </div>
                  {group.rows.map((row, i) => (
                    <ComparisonRow
                      key={row.feature}
                      row={row}
                      delay={i * 0.02}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>

          <p className="mt-4 text-xs text-neutral-600">
            Last reviewed September 2026. Competitor pricing and features change —
            check their sites for the current state.
          </p>
        </Container>
      </section>

      {/* Tradeoffs */}
      <section className="py-16 sm:py-20">
        <Container>
          <div className="mb-10 max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              When each one wins
            </h2>
            <p className="mt-3 text-neutral-400">
              Home Screens is not always the right pick. Here is where
              MagicMirror or Dakboard are genuinely the better choice.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {tradeoffs.map((t, i) => (
              <TradeoffCard key={t.title} tradeoff={t} delay={i * 0.06} />
            ))}
          </div>
        </Container>
      </section>

      {/* Final CTA */}
      <section className="py-20 sm:py-24">
        <Container>
          <div className="relative overflow-hidden rounded-2xl border border-[#222] bg-gradient-to-br from-[#161616] to-[#0a0a0a] p-10 text-center sm:p-14">
            <div className="absolute inset-0 -z-10 opacity-30">
              <div className="absolute left-1/2 top-0 h-56 w-56 -translate-x-1/2 rounded-full bg-cyan-500/10 blur-3xl" />
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              See it running on your own Pi
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-neutral-400">
              No account. No cloud. About 10 minutes of hands-on work, and
              around 30 from unboxing to a display the whole family will use.
              You need a Raspberry Pi 4 or 5 and any HDMI screen, about $90
              from scratch. See{' '}
              <Link href="/docs/what-to-buy" className="text-cyan-400 hover:text-cyan-300">
                what to buy
              </Link>
              .
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <Button href="/docs/getting-started">Get Started</Button>
              <Button
                href="https://github.com/home-screens/home-screens"
                variant="outline"
              >
                <Github className="h-4 w-4" />
                View on GitHub
              </Button>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}

function TradeoffCard({
  tradeoff,
  delay,
}: {
  tradeoff: {
    icon: LucideIcon;
    title: string;
    items: string[];
  };
  delay: number;
}) {
  const Icon = tradeoff.icon;
  return (
    <Reveal delay={delay} className="rounded-xl border border-[#222] bg-[#161616] p-6">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#222] bg-[#0a0a0a]">
        <Icon className="h-4 w-4 text-cyan-400/70" />
      </div>
      <p className="mt-4 text-base font-semibold text-white">
        {tradeoff.title}
      </p>
      <ul className="mt-4 space-y-2.5">
        {tradeoff.items.map((item) => (
          <li
            key={item}
            className="flex gap-3 text-sm leading-relaxed text-neutral-400"
          >
            <span
              aria-hidden="true"
              className="mt-2 h-1 w-1 shrink-0 rounded-full bg-cyan-400/60"
            />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </Reveal>
  );
}
