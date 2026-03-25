'use client';

import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { Github } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Container } from '@/components/Container';
import { useLatestVersion } from '@/hooks/useLatestVersion';

export function OpenSourceCTA() {
  const version = useLatestVersion();
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-60px' });

  return (
    <section className="relative overflow-hidden py-24">
      {/* Cyan radial glow */}
      <div className="absolute top-1/2 left-1/2 -z-10 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-500/[0.04] blur-3xl" />

      <Container>
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          <h2 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Free. Open Source. Forever.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-neutral-400">
            No subscriptions, no cloud lock-in, no personal data harvesting. Just a
            display that works for you.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <Badge color="green">MIT License</Badge>
            <Badge color="cyan">
              <span className="font-mono">{version}</span>
            </Badge>
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Button href="https://github.com/home-screens/home-screens">
              <Github className="h-4 w-4" />
              View on GitHub
            </Button>
            <Button
              href="https://github.com/home-screens/home-screens#quick-start"
              variant="outline"
            >
              Read the Docs
            </Button>
          </div>
        </motion.div>
      </Container>
    </section>
  );
}
