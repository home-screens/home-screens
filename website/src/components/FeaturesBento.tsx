import {
  Puzzle, Monitor, CalendarClock, Layers, Shield,
  Paintbrush, CloudOff, CloudSun, ArrowUpCircle, Maximize, Languages,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Container } from '@/components/Container';
import { SectionHeader } from '@/components/SectionHeader';
import { Reveal } from '@/components/Reveal';
import { LOCALE_COUNT, LOCALE_NATIVE_NAMES, WEATHER_PROVIDER_COUNT } from '@/lib/stats';

interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
  stat?: string;
}

const featuresLeft: Feature[] = [
  {
    icon: Puzzle,
    title: 'Plugin System',
    description: 'Build custom modules with the plugin API. Drop them in, register, done.',
  },
  {
    icon: Monitor,
    title: 'Remote Control',
    description: 'Wake, sleep, adjust brightness, switch profiles — all from your phone.',
  },
  {
    icon: CalendarClock,
    title: 'Smart Scheduling',
    description: 'Show modules by day and time. Morning news, evening sports, weekend photos.',
  },
  {
    icon: Layers,
    title: 'Profiles',
    description: 'Multiple layouts that auto-switch on a schedule or on demand.',
  },
  {
    icon: Maximize,
    title: 'Fullscreen Modes',
    description: 'Calendar, weather, chore chart, meal planner, news and photo frame, each filling the entire display.',
  },
];

const featuresRight: Feature[] = [
  {
    icon: Shield,
    title: 'Password Protected',
    description: 'Lock the editor with an optional password, plus an allowed-address list so devices on your own network skip the prompt.',
  },
  {
    icon: Paintbrush,
    title: 'Visual Editor',
    description: 'Drag-and-drop canvas. Resize, style, and configure without code.',
  },
  {
    icon: CloudOff,
    title: 'Zero Cloud',
    description: 'Runs entirely on your network. No accounts, no PII, opt-out anonymous telemetry.',
  },
  {
    icon: CloudSun,
    title: 'Weather Providers',
    stat: String(WEATHER_PROVIDER_COUNT),
    description: 'Open-Meteo, NOAA, Yr.no, SMHI, Met Office, Environment Canada, OpenWeatherMap, WeatherAPI, Pirate Weather.',
  },
  {
    icon: ArrowUpCircle,
    title: 'OTA Updates',
    description: 'One-click upgrade from the UI. Rollback if anything breaks. Auto-backups.',
  },
  {
    icon: Languages,
    title: 'Languages',
    stat: String(LOCALE_COUNT),
    description: LOCALE_NATIVE_NAMES.join(' · ') + '. Switch from Settings.',
  },
];

function FeatureRow({ feature, delay }: { feature: Feature; delay: number }) {
  return (
    <Reveal
      delay={delay}
      className="flex gap-4 rounded-xl border border-[#222] bg-[#161616] p-4 transition-colors hover:border-cyan-500/30"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#222] bg-[#0a0a0a]">
        <feature.icon className="h-4 w-4 text-cyan-400/70" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-white">
          {feature.stat && (
            <span className="mr-1.5 font-mono text-cyan-400">{feature.stat}</span>
          )}
          {feature.title}
        </p>
        <p className="mt-0.5 text-sm text-neutral-500 leading-relaxed">{feature.description}</p>
      </div>
    </Reveal>
  );
}

export function FeaturesBento() {
  return (
    <section id="features" className="py-20">
      <Container>
        <div className="mb-10">
          <SectionHeader
            title="More than a dashboard"
            description={
              <>
                A full platform for wall-mounted displays. Scheduling, remote control,
                plugins, OTA updates — not just widgets on a screen.
              </>
            }
          />
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
          <div className="flex flex-col gap-3">
            {featuresLeft.map((f, i) => (
              <FeatureRow key={f.title} feature={f} delay={i * 0.06} />
            ))}
          </div>
          <div className="flex flex-col gap-3">
            {featuresRight.map((f, i) => (
              <FeatureRow key={f.title} feature={f} delay={i * 0.06 + 0.03} />
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
