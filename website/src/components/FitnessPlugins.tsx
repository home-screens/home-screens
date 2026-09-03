'use client';

import { useEffect, useState } from 'react';
import {
  Activity,
  BatteryCharging,
  Map,
  Target,
  TrendingUp,
  Trophy,
  Workflow,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Container } from '@/components/Container';
import { SectionHeader } from '@/components/SectionHeader';
import { Reveal } from '@/components/Reveal';
import { Badge } from '@/components/ui/badge';

const STRAVA_ORANGE = '#FC4C02';
const GARMIN_BLUE = '#3b82f6';

// Real module renders screenshotted off a live display with Playwright —
// actual rides, sleep, and routes, not mockups or fixture data.
const STRAVA_SHOTS: Shot[] = [
  { src: '/images/plugins/strava/route-map.webp', label: 'Route map' },
  { src: '/images/plugins/strava/latest-hero.webp', label: 'Latest activity' },
  { src: '/images/plugins/strava/recent-activities.webp', label: 'Recent activities' },
  { src: '/images/plugins/strava/training-volume.webp', label: 'Training volume' },
  { src: '/images/plugins/strava/year-poster.webp', label: 'Year so far' },
  { src: '/images/plugins/strava/goal-progress.webp', label: 'Goal progress' },
];

const GARMIN_SHOTS: Shot[] = [
  { src: '/images/plugins/garmin/summary.webp', label: 'Daily summary' },
  { src: '/images/plugins/garmin/body-battery.webp', label: 'Body Battery' },
  { src: '/images/plugins/garmin/sleep.webp', label: 'Sleep' },
  { src: '/images/plugins/garmin/weekly.webp', label: 'Weekly training' },
  { src: '/images/plugins/garmin/latest-activity.webp', label: 'Latest activity' },
  { src: '/images/plugins/garmin/training-readiness.webp', label: 'Training readiness' },
];

export function FitnessPlugins() {
  return (
    <section className="relative overflow-hidden py-24">
      {/* Soft warm glow, mirroring the cyan one in the HA section */}
      <div className="absolute top-1/3 left-0 -z-10 h-[500px] w-[500px] -translate-x-1/3 rounded-full bg-orange-500/[0.04] blur-3xl" />

      <Container>
        <Reveal y={0} margin="-80px">
          <div className="max-w-2xl">
            <SectionHeader
              eyebrow={
                <Badge color="orange" className="mb-6">
                  <Activity className="h-3 w-3" />
                  Health &amp; Fitness plugins
                </Badge>
              }
              title={
                <>
                  Now syncs with{' '}
                  <span style={{ color: GARMIN_BLUE }}>Garmin</span> and{' '}
                  <span style={{ color: STRAVA_ORANGE }}>Strava</span>
                </>
              }
              description={
                <>
                  Two new plugins put your runs, rides, sleep, and recovery on
                  the wall. Sign in once from the editor — tokens stay on your
                  hub, and the display never sees your password.
                </>
              }
              descriptionClassName="mt-4 max-w-lg text-neutral-400"
            />
          </div>

          <div className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <PluginCard
              name="Strava"
              accent={STRAVA_ORANGE}
              viewCount={22}
              tagline="Your Strava life, from one activity to the whole year."
              shots={STRAVA_SHOTS}
              intervalMs={4200}
              features={[
                {
                  icon: Map,
                  title: 'Route art',
                  description:
                    'Recent routes drawn as line art, or a year of them overlaid on one canvas — the places you actually go.',
                },
                {
                  icon: Target,
                  title: 'Goals, heatmap, calendar',
                  description:
                    'Progress rings for weekly and yearly goals, a 52-week training heatmap, and a month colored by intensity.',
                },
                {
                  icon: Trophy,
                  title: 'The deep cuts',
                  description:
                    'Fitness trend, segment PRs, gear mileage, milestones — even your Eddington number.',
                },
              ]}
              repoUrl="https://github.com/home-screens/home-screens-plugin-strava"
            />

            <PluginCard
              name="Garmin"
              accent={GARMIN_BLUE}
              viewCount={14}
              tagline="Everything your watch knows, on the display."
              shots={GARMIN_SHOTS}
              intervalMs={5200}
              features={[
                {
                  icon: BatteryCharging,
                  title: 'Wellness at a glance',
                  description:
                    'Body Battery, stress, sleep stages, HRV, and resting heart rate — straight from Garmin Connect.',
                },
                {
                  icon: TrendingUp,
                  title: 'Training views',
                  description:
                    'Readiness, training status, weekly volume, race predictions, and personal records.',
                },
                {
                  icon: Workflow,
                  title: 'Talks to other modules',
                  description:
                    'Publishes steps, sleep, and Body Battery as shared state — show a wind-down note when your battery runs low.',
                },
              ]}
              repoUrl="https://github.com/home-screens/home-screens-plugin-garmin"
            />
          </div>
        </Reveal>
      </Container>
    </section>
  );
}

// ── Plugin card ───────────────────────────────────────────────────────────

function PluginCard({
  name,
  accent,
  viewCount,
  tagline,
  shots,
  intervalMs,
  features,
  repoUrl,
}: {
  name: string;
  accent: string;
  viewCount: number;
  tagline: string;
  shots: Shot[];
  intervalMs: number;
  features: { icon: LucideIcon; title: string; description: string }[];
  repoUrl: string;
}) {
  return (
    <div className="flex flex-col rounded-2xl border border-[#222] bg-[#111] p-6 sm:p-8">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xl font-bold tracking-tight text-white">{name}</h3>
        <Badge color="zinc">{viewCount} views</Badge>
      </div>
      <p className="mt-1 text-sm text-neutral-500">{tagline}</p>

      <div className="mt-6">
        <ShotCarousel plugin={name} shots={shots} accent={accent} intervalMs={intervalMs} />
      </div>

      <div className="mt-6 space-y-4 pb-6">
        {features.map(({ icon: Icon, title, description }) => (
          <div key={title} className="flex gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#222] bg-[#161616]">
              <Icon className="h-4 w-4" style={{ color: accent }} />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">{title}</p>
              <p className="mt-0.5 text-sm text-neutral-500">{description}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-auto border-t border-[#1d1d1d] pt-4">
        <a
          href={repoUrl}
          className="text-sm font-medium text-neutral-400 transition-colors hover:text-white"
        >
          Setup guide &rarr;
        </a>
      </div>
    </div>
  );
}

// ── Rotating screenshot carousel ──────────────────────────────────────────
// Crossfades through real module captures (1280×840, shown at 32:21).
// Auto-advance pauses on hover and is disabled for reduced-motion users;
// the dots always allow manual navigation.

type Shot = { src: string; label: string };

function ShotCarousel({
  plugin,
  shots,
  accent,
  intervalMs,
}: {
  plugin: string;
  shots: Shot[];
  accent: string;
  intervalMs: number;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = setInterval(
      () => setIndex((i) => (i + 1) % shots.length),
      intervalMs,
    );
    return () => clearInterval(id);
  }, [paused, shots.length, intervalMs]);

  return (
    <div>
      <div
        className="relative aspect-[32/21] overflow-hidden rounded-xl border border-[#222] bg-[#0b0f1a]"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        {shots.map((shot, i) => (
          <img
            key={shot.src}
            src={shot.src}
            alt={`${plugin} plugin — ${shot.label} view`}
            width={1280}
            height={840}
            loading={i === 0 ? 'eager' : 'lazy'}
            className="absolute inset-0 h-full w-full object-cover transition-opacity duration-700"
            style={{ opacity: i === index ? 1 : 0 }}
          />
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          {shots.map((shot, i) => (
            <button
              key={shot.src}
              type="button"
              aria-label={`Show the ${shot.label} view`}
              onClick={() => setIndex(i)}
              className="h-1.5 rounded-full transition-all duration-300"
              style={{
                width: i === index ? 20 : 6,
                background: i === index ? accent : 'rgba(255,255,255,0.18)',
              }}
            />
          ))}
        </div>
        <span className="truncate text-[11px] text-neutral-500">
          {shots[index].label}
        </span>
      </div>
    </div>
  );
}
