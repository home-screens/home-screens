'use client';

import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { Container } from '@/components/Container';

const steps = [
  {
    number: '01',
    title: 'Flash & Boot',
    description:
      'Write the image to an SD card, plug it into your Pi, and power on. About ten minutes of hands-on work, a little longer with the download and first boot.',
  },
  {
    number: '02',
    title: 'Design',
    description:
      'Open the editor from any device on your network. Drag modules, pick a template, or start blank.',
  },
  {
    number: '03',
    title: 'Mount',
    description:
      'Hang the display on the wall. It runs 24/7, updating in real time. No cloud required.',
  },
];

export function HowItWorks() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-60px' });

  return (
    <section className="py-24">
      <Container>
        <div className="mb-12">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Three steps. That&apos;s it.
          </h2>
        </div>

        <motion.div
          ref={ref}
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ duration: 0.5 }}
          className="grid grid-cols-1 gap-8 md:grid-cols-3"
        >
          {steps.map((step, i) => (
            <motion.div
              key={step.number}
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.4, delay: i * 0.15 }}
              className="rounded-2xl border border-[#222] bg-[#161616] p-6"
            >
              <span className="font-mono text-5xl font-bold text-cyan-500/20">
                {step.number}
              </span>
              <h3 className="mt-4 text-xl font-semibold text-white">
                {step.title}
              </h3>
              <p className="mt-2 text-sm text-neutral-500">
                {step.description}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </Container>
    </section>
  );
}
