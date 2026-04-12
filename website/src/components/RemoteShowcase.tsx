'use client';

import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { Smartphone, ClipboardCheck, UtensilsCrossed, SlidersHorizontal } from 'lucide-react';
import { Container } from '@/components/Container';

const features = [
  {
    icon: SlidersHorizontal,
    title: 'Display control',
    description:
      'Navigate screens, adjust brightness, sleep/wake the display, switch profiles — all from your phone.',
  },
  {
    icon: ClipboardCheck,
    title: 'Chore tracking',
    description:
      'Family members check off chores from their phone. Progress syncs to the wall display in real time.',
  },
  {
    icon: UtensilsCrossed,
    title: 'Meal planning',
    description:
      'Plan meals, browse a recipe library, and manage your weekly menu from the couch.',
  },
];

const phones = [
  {
    src: '/images/remote-control.jpg',
    alt: 'Remote control interface with screen navigation, brightness slider, and profile switching',
    width: 347,
    height: 750,
    rotate: -6,
    z: 1,
  },
  {
    src: '/images/remote-chores.jpg',
    alt: 'Chores tab showing family member progress and daily task checklist',
    width: 338,
    height: 750,
    rotate: 0,
    z: 3,
  },
  {
    src: '/images/remote-meals.jpg',
    alt: 'Meals tab showing weekly meal plan with emoji and prep times',
    width: 354,
    height: 750,
    rotate: 6,
    z: 2,
  },
];

function PhoneFrame({
  src,
  alt,
  width,
  height,
  rotate,
  z,
  delay,
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  rotate: number;
  z: number;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30, rotate: 0 }}
      whileInView={{ opacity: 1, y: 0, rotate }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.6, delay, ease: 'easeOut' }}
      className="relative shrink-0"
      style={{ zIndex: z }}
    >
      {/* Phone shadow */}
      <div className="absolute -inset-2 -z-10 rounded-[28px] bg-black/30 blur-xl" />

      {/* Phone body */}
      <div
        className="relative w-[180px] overflow-hidden rounded-[22px] sm:w-[200px]"
        style={{
          background:
            'linear-gradient(145deg, #2a2a2c 0%, #1a1a1b 30%, #0e0e0f 70%, #1c1c1e 100%)',
          padding: '4px',
          boxShadow: [
            'inset 1px 1px 0 rgba(255,255,255,0.07)',
            'inset -1px -1px 0 rgba(0,0,0,0.4)',
            '0 8px 32px rgba(0,0,0,0.5)',
          ].join(', '),
        }}
      >
        {/* Screen */}
        <div className="relative overflow-hidden rounded-[18px] bg-black">
          {/* Notch */}
          <div className="absolute top-0 left-1/2 z-10 h-[14px] w-[60px] -translate-x-1/2 rounded-b-xl bg-black" />
          <picture>
            <source srcSet={src.replace('.jpg', '.webp')} type="image/webp" />
            <img
              src={src}
              alt={alt}
              width={width}
              height={height}
              className="relative block w-full"
            />
          </picture>
          {/* Glass reflection */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'linear-gradient(135deg, rgba(255,255,255,0.04) 0%, transparent 40%, transparent 60%, rgba(255,255,255,0.01) 100%)',
            }}
          />
        </div>
      </div>
    </motion.div>
  );
}

export function RemoteShowcase() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section className="py-24 overflow-hidden">
      <Container>
        <motion.div
          ref={ref}
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ duration: 0.5 }}
        >
          {/* Header */}
          <div className="text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#222] bg-[#161616] px-4 py-1.5 text-sm text-neutral-400">
              <Smartphone className="h-4 w-4 text-cyan-400/70" />
              Works on any phone
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Control everything from your phone
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-neutral-400">
              No app to install. Open the remote on any device on your network to manage
              your display, track chores, and plan meals.
            </p>
          </div>

          {/* Phone screenshots */}
          <div className="relative mt-16 flex items-center justify-center gap-0 sm:-space-x-4">
            {/* Ambient glow */}
            <div className="absolute inset-0 -z-10 mx-auto h-[400px] w-[500px] rounded-full bg-cyan-500/[0.03] blur-3xl" />

            {phones.map((phone, i) => (
              <PhoneFrame
                key={phone.src}
                {...phone}
                delay={i * 0.12}
              />
            ))}
          </div>

          {/* Feature callouts */}
          <div className="mt-16 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {features.map(({ icon: Icon, title, description }, i) => (
              <motion.div
                key={title}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.08 }}
                className="rounded-xl border border-[#222] bg-[#161616] p-5"
              >
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg border border-[#222] bg-[#0a0a0a]">
                  <Icon className="h-4 w-4 text-cyan-400/70" />
                </div>
                <p className="font-semibold text-white">{title}</p>
                <p className="mt-1 text-sm leading-relaxed text-neutral-500">
                  {description}
                </p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </Container>
    </section>
  );
}
