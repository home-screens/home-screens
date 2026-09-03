import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Container } from '@/components/Container';
import { DashboardShowcase } from '@/components/DashboardShowcase';
import { Github } from 'lucide-react';
import { Reveal } from '@/components/Reveal';
import { MODULE_COUNT } from '@/lib/stats';

const facts = [
  'Free and open source',
  'Raspberry Pi 4 or 5 + any HDMI screen',
  'About $90 if you are starting from scratch',
];

export function Hero({ version }: { version: string }) {

  return (
    <section className="relative overflow-hidden pt-32 pb-20 sm:pt-40 sm:pb-28">
      {/* Background: dot grid */}
      <div
        className="absolute inset-0 -z-10"
        style={{
          backgroundImage:
            'radial-gradient(circle, rgba(255,255,255,0.03) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />
      {/* Background: cyan glow behind display */}
      <div className="absolute top-1/2 right-0 -z-10 h-[600px] w-[600px] -translate-y-1/2 translate-x-1/4 rounded-full bg-cyan-500/[0.04] blur-3xl" />

      <Container>
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12 lg:gap-12">
          {/* Left column: text */}
          <Reveal className="lg:col-span-5" y={20} immediate>
            <Badge color="cyan" className="mb-6">
              <span className="font-mono">{version}</span>
              <span className="mx-1.5 text-cyan-500/40">|</span>
              Open Source
            </Badge>

            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
              Your home.
              <br />
              Your data.
              <br />
              <span className="text-cyan-400">Your display.</span>
            </h1>

            <p className="mt-6 max-w-lg text-lg text-neutral-400">
              A self-hosted smart display that runs on a Raspberry Pi. {MODULE_COUNT} modules, a
              visual drag-and-drop editor, and zero cloud dependency.
            </p>
            <p className="mt-3 max-w-lg text-base text-neutral-500">
              Chores, calendar, meals, photos and weather, on a screen the whole
              family can read from across the room.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Button href="/docs/getting-started">Get Started</Button>
              <Button
                href="https://github.com/home-screens/home-screens"
                variant="outline"
              >
                <Github className="h-4 w-4" />
                GitHub
              </Button>
            </div>

            {/* The three facts a first-time visitor came for, plus the download */}
            <ul className="mt-10 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-neutral-400">
              {facts.map((fact) => (
                <li
                  key={fact}
                  className="rounded-md border border-[#222] bg-[#161616] px-2.5 py-1"
                >
                  {fact}
                </li>
              ))}
              <li>
                <Link
                  href="/docs/getting-started#download-and-flash"
                  className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-cyan-300 transition-colors hover:bg-cyan-500/20"
                >
                  Download the image
                </Link>
              </li>
            </ul>
          </Reveal>

          {/* Right column: dashboard showcase */}
          <Reveal className="lg:col-span-7" y={0} delay={0.15} immediate>
            <DashboardShowcase />
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
