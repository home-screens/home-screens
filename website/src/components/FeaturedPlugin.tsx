'use client';

import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import {
  Lightbulb,
  Thermometer,
  Music2,
  Lock,
  Battery,
  Layers,
  ToggleRight,
  MousePointerClick,
  Home,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Container } from '@/components/Container';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const callouts = [
  {
    icon: Layers,
    title: '15+ entity domains',
    description:
      'Lights, climate, media, covers, locks, sensors, switches — each rendered as a type-aware card, not a row in a table.',
  },
  {
    icon: ToggleRight,
    title: 'Tap to toggle',
    description:
      'Lights, switches, scenes, media play/pause, covers — one-tap controls live on the wall display, no app needed.',
  },
  {
    icon: MousePointerClick,
    title: 'Zero templates, zero YAML',
    description:
      'Pick entities from a visual browser. No Jinja2 strings, no manual icon mapping, no value-replacement arrays.',
  },
];

export function FeaturedPlugin() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section className="relative overflow-hidden py-24">
      {/* Soft cyan glow behind the mockup */}
      <div className="absolute top-1/2 right-0 -z-10 h-[500px] w-[500px] -translate-y-1/2 translate-x-1/4 rounded-full bg-cyan-500/[0.04] blur-3xl" />

      <Container>
        <motion.div
          ref={ref}
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ duration: 0.5 }}
          className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-16"
        >
          {/* Left: text + callouts */}
          <div>
            <Badge color="cyan" className="mb-6">
              <Home className="h-3 w-3" />
              Featured plugin
            </Badge>
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Now talks to{' '}
              <span className="text-cyan-400">Home Assistant</span>
            </h2>
            <p className="mt-4 max-w-lg text-neutral-400">
              Beautiful entity cards, area grouping, and tap-to-toggle
              controls for your Home Assistant instance — installable from
              the plugin browser. The most-requested feature, finally
              shipped.
            </p>

            <div className="mt-10 space-y-6">
              {callouts.map(({ icon: Icon, title, description }) => (
                <div key={title} className="flex gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#222] bg-[#161616]">
                    <Icon className="h-5 w-5 text-cyan-400/70" />
                  </div>
                  <div>
                    <p className="font-semibold text-white">{title}</p>
                    <p className="mt-1 text-sm text-neutral-500">
                      {description}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Button href="/docs/plugins">How plugins work</Button>
              <Button
                href="/docs/faq#does-it-work-with-home-assistant"
                variant="outline"
              >
                Setup &amp; FAQ
              </Button>
            </div>
          </div>

          {/* Right: Home Assistant entity card mockup */}
          <EntityGridMockup />
        </motion.div>
      </Container>
    </section>
  );
}

// ── Mockup ────────────────────────────────────────────────────────────────
// Mirrors the actual `card-grid` view from the home-assistant plugin's
// cards.tsx: same tone palette (amber=on, orange=active, red=alert,
// neutral=default), same card shape (border 1px, radius 12, padding 14),
// same internal structure (icon+name header → big value → muted sub-text).

const TONES = {
  default: {
    background: 'rgba(255, 255, 255, 0.04)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    color: 'rgba(255, 255, 255, 0.75)',
  },
  on: {
    background:
      'linear-gradient(135deg, rgba(251, 191, 36, 0.12), rgba(255, 255, 255, 0.03))',
    borderColor: 'rgba(251, 191, 36, 0.22)',
    color: '#fef3c7',
  },
  active: {
    background:
      'linear-gradient(135deg, rgba(251, 146, 60, 0.14), rgba(251, 146, 60, 0.04))',
    borderColor: 'rgba(251, 146, 60, 0.28)',
    color: '#fed7aa',
  },
  alert: {
    background:
      'linear-gradient(135deg, rgba(239, 68, 68, 0.12), rgba(239, 68, 68, 0.02))',
    borderColor: 'rgba(239, 68, 68, 0.26)',
    color: '#fecaca',
  },
} as const;

type Tone = keyof typeof TONES;

function EntityGridMockup() {
  return (
    <div className="rounded-2xl border border-[#222] bg-[#0f0f0f] p-4 shadow-[0_20px_60px_rgba(0,0,0,0.4)] sm:p-5">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 10,
        }}
      >
        <CardShell tone="on">
          <CardHeader icon={Lightbulb} name="Living room" />
          <BigValue>
            On
            <span className="ml-1.5 text-sm font-normal text-white/55">
              · 60%
            </span>
          </BigValue>
          <SubText>
            <span>Warm · 2700K</span>
          </SubText>
        </CardShell>

        <CardShell tone="active">
          <CardHeader icon={Thermometer} name="Thermostat" />
          <BigValue>72°</BigValue>
          <SubText>
            <span>target 70°</span>
            <span className="capitalize">heating</span>
          </SubText>
        </CardShell>

        <CardShell tone="default">
          <CardHeader icon={Lock} name="Front door" />
          <BigValue>Locked</BigValue>
          <SubText>
            <span>2 min ago</span>
          </SubText>
        </CardShell>

        <CardShell tone="alert">
          <CardHeader icon={Battery} name="Doorbell battery" />
          <BigValue>24%</BigValue>
          <SubText>
            <span>just now</span>
            <span className="text-[#f87171]">● low</span>
          </SubText>
        </CardShell>

        <CardShell tone="active" spanFull>
          <CardHeader icon={Music2} name="Kitchen speaker" />
          <div className="flex flex-col gap-0.5">
            <div className="truncate text-[15px] font-semibold tracking-tight text-white">
              Heat Waves
            </div>
            <div className="text-xs text-white/55">Glass Animals</div>
          </div>
          <SubText>
            <span className="capitalize">playing</span>
          </SubText>
        </CardShell>
      </div>
    </div>
  );
}

function CardShell({
  tone,
  spanFull,
  children,
}: {
  tone: Tone;
  spanFull?: boolean;
  children: React.ReactNode;
}) {
  const t = TONES[tone];
  return (
    <div
      style={{
        background: t.background,
        border: `1px solid ${t.borderColor}`,
        color: t.color,
        borderRadius: 12,
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        minHeight: 100,
        gridColumn: spanFull ? '1 / -1' : undefined,
      }}
    >
      {children}
    </div>
  );
}

function CardHeader({ icon: Icon, name }: { icon: LucideIcon; name: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-[18px] w-[18px]" style={{ color: 'currentColor' }} />
      <span className="truncate text-[10px] uppercase tracking-[0.06em] text-white/60">
        {name}
      </span>
    </div>
  );
}

function BigValue({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="truncate font-semibold text-white"
      style={{
        fontSize: 24,
        letterSpacing: '-0.02em',
        lineHeight: 1.15,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {children}
    </div>
  );
}

function SubText({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-auto flex justify-between gap-1.5 text-[11px] text-white/45">
      {children}
    </div>
  );
}
