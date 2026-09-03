'use client';

import { motion } from 'framer-motion';
import { Smartphone, ClipboardCheck, UtensilsCrossed, SlidersHorizontal } from 'lucide-react';
import { Container } from '@/components/Container';
import { SectionHeader } from '@/components/SectionHeader';
import { Reveal } from '@/components/Reveal';
import shots from '../../public/images/docs/manifest.json';

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

// Renders from `npm run docs:shots` in the main repo: the same three tabs the
// docs show, so the homepage never lags behind the app.
const phones = [
  { name: 'remote-control', rotate: -6, z: 1 },
  { name: 'remote-chores', rotate: 0, z: 3 },
  { name: 'remote-meals', rotate: 6, z: 2 },
].map(({ name, rotate, z }) => {
  const shot = shots[name as keyof typeof shots];
  return { src: `/images/docs/${name}.jpg`, webp: `/images/docs/${name}.webp`, alt: shot.alt, width: shot.width, height: shot.height, rotate, z };
});

function PhoneFrame({
  src,
  webp,
  alt,
  width,
  height,
  rotate,
  z,
  delay,
}: {
  src: string;
  webp: string;
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
            <source srcSet={webp} type="image/webp" />
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
  return (
    <section className="py-24 overflow-hidden">
      <Container>
        <Reveal y={0} margin="-80px">
          {/* Header */}
          <div className="text-center">
            <SectionHeader
              eyebrow={
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#222] bg-[#161616] px-4 py-1.5 text-sm text-neutral-400">
                  <Smartphone className="h-4 w-4 text-cyan-400/70" />
                  Works on any phone
                </div>
              }
              title="Control everything from your phone"
              description={
                <>
                  No app to install. Open the remote on any device on your network to manage
                  your display, track chores, and plan meals.
                </>
              }
              descriptionClassName="mx-auto mt-4 max-w-2xl text-neutral-400"
            />
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
              <Reveal
                key={title}
                delay={i * 0.08}
                className="rounded-xl border border-[#222] bg-[#161616] p-5"
              >
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg border border-[#222] bg-[#0a0a0a]">
                  <Icon className="h-4 w-4 text-cyan-400/70" />
                </div>
                <p className="font-semibold text-white">{title}</p>
                <p className="mt-1 text-sm leading-relaxed text-neutral-500">
                  {description}
                </p>
              </Reveal>
            ))}
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
