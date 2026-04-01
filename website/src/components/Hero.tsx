'use client';

import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Container } from '@/components/Container';
import { DisplayFrame } from '@/components/DisplayFrame';
import { Github } from 'lucide-react';
import { useLatestVersion } from '@/hooks/useLatestVersion';

const techStack = ['Next.js', 'React', 'Tailwind CSS', 'Raspberry Pi'];

export function Hero() {
  const version = useLatestVersion();

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
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12 lg:gap-16">
          {/* Left column: text */}
          <motion.div
            className="lg:col-span-7"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
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
              A self-hosted smart display that runs on a Raspberry Pi. 38 modules, a
              visual drag-and-drop editor, and zero cloud dependency.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Button href="https://github.com/home-screens/home-screens#quick-start">
                Get Started
              </Button>
              <Button
                href="https://github.com/home-screens/home-screens"
                variant="outline"
              >
                <Github className="h-4 w-4" />
                GitHub
              </Button>
            </div>

            {/* Tech strip */}
            <div className="mt-10 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-neutral-500">
              <span className="uppercase tracking-wider">Built with</span>
              {techStack.map((tech) => (
                <span
                  key={tech}
                  className="rounded-md border border-[#222] bg-[#161616] px-2.5 py-1 font-mono text-neutral-400"
                >
                  {tech}
                </span>
              ))}
            </div>
          </motion.div>

          {/* Right column: display mockup */}
          <motion.div
            className="lg:col-span-5"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.15 }}
          >
            <DisplayFrame
              screens={[
                { src: '/images/display-1.jpg', alt: 'Family dashboard with clock, calendar, weather, and garbage schedule' },
                { src: '/images/display-2.jpg', alt: 'Easter countdown with forecast and affirmations' },
                { src: '/images/display-3.jpg', alt: 'Finance display with stocks, NHL standings, and word of the day' },
                { src: '/images/display-4.jpg', alt: 'Fullscreen chore chart with family members, time-of-day bands, and star chart' },
                { src: '/images/display-5.jpg', alt: 'Fullscreen meal planner showing weekly meal schedule' },
                { src: '/images/display-6.jpg', alt: 'Fullscreen calendar with weekly schedule view and color-coded events' },
              ]}
              interval={6000}
            />
          </motion.div>
        </div>
      </Container>
    </section>
  );
}
