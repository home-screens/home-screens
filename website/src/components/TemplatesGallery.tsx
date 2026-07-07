'use client';

import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { Container } from '@/components/Container';
import { SectionHeader } from '@/components/SectionHeader';

const templates = [
  { name: 'Morning Dashboard', modules: 8, description: 'Weather, calendar, news, and commute time at a glance.' },
  { name: 'Family Dashboard', modules: 10, description: 'Meal planner, chore chart, calendar, and sticky notes.' },
  { name: 'Kitchen Display', modules: 6, description: 'Meal planner, grocery list, clock, and timers.' },
  { name: 'Productivity', modules: 7, description: 'Todoist, calendar, year progress, and affirmations.' },
  { name: 'Sports Hub', modules: 5, description: 'Live scores, standings, and news for your leagues.' },
  { name: 'News & Finance', modules: 6, description: 'Headlines, stock ticker, crypto prices, and world clock.' },
  { name: 'Photo Frame', modules: 3, description: 'Slideshow with clock overlay. Simple and beautiful.' },
  { name: 'Info Board', modules: 9, description: 'Weather, transit, calendar, QR code, and greeting.' },
  { name: 'Minimal Clock', modules: 2, description: 'Just the time and date. Nothing else.' },
  { name: 'Weather Station', modules: 5, description: 'Forecasts, radar, moon phase, air quality, and sunrise.' },
];

export function TemplatesGallery() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-60px' });

  return (
    <section id="templates" className="py-24">
      <Container>
        <div className="mb-10">
          <SectionHeader
            title="Start from a template"
            description="Pre-built layouts for common setups. Customize from there."
          />
        </div>
      </Container>

      <motion.div
        ref={ref}
        initial={{ opacity: 0 }}
        animate={isInView ? { opacity: 1 } : {}}
        transition={{ duration: 0.5 }}
        className="flex gap-4 overflow-x-auto px-4 pb-4 sm:px-6 lg:px-8 snap-x"
      >
        {templates.map((t) => (
          <div
            key={t.name}
            className="w-72 shrink-0 snap-start rounded-2xl border border-[#222] bg-[#161616] p-5 transition-colors hover:border-cyan-500/30"
          >
            <div className="flex items-baseline justify-between">
              <h3 className="font-semibold text-white">{t.name}</h3>
              <span className="font-mono text-xs text-cyan-300">
                {t.modules} modules
              </span>
            </div>
            <p className="mt-2 text-sm text-neutral-500">{t.description}</p>
          </div>
        ))}
      </motion.div>
    </section>
  );
}
