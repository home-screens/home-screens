'use client';

import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';

interface DisplayFrameProps {
  screens: { src: string; alt: string }[];
  interval?: number;
  className?: string;
}

export function DisplayFrame({
  screens,
  interval = 4000,
  className,
}: DisplayFrameProps) {
  const [index, setIndex] = useState(0);

  const advance = useCallback(() => {
    setIndex((prev) => (prev + 1) % screens.length);
  }, [screens.length]);

  useEffect(() => {
    if (screens.length <= 1) return;
    const id = setInterval(advance, interval);
    return () => clearInterval(id);
  }, [advance, interval, screens.length]);

  return (
    <div className={clsx('relative mx-auto w-full max-w-[300px]', className)}>
      {/* Ambient backlight glow */}
      <div
        className="absolute -inset-6 -z-10 opacity-60 blur-2xl"
        style={{
          background:
            'radial-gradient(ellipse at 50% 40%, rgba(6,182,212,0.12) 0%, rgba(6,182,212,0.04) 50%, transparent 80%)',
        }}
      />

      {/* Wall shadow */}
      <div className="absolute -inset-2 -z-20 bg-black/40 blur-xl" />

      {/* TV body — sharp corners like a real OLED panel */}
      <div
        className="relative aspect-[9/16] overflow-hidden rounded-sm"
        style={{
          background: 'linear-gradient(145deg, #2a2a2c 0%, #1a1a1b 30%, #0e0e0f 70%, #1c1c1e 100%)',
          padding: '5px',
          boxShadow: [
            'inset 1px 1px 0 rgba(255,255,255,0.07)',
            'inset -1px -1px 0 rgba(0,0,0,0.4)',
            '0 8px 32px rgba(0,0,0,0.6)',
            '0 2px 8px rgba(0,0,0,0.4)',
          ].join(', '),
        }}
      >
        {/* Inner bezel */}
        <div
          className="relative h-full w-full overflow-hidden rounded-[1px]"
          style={{
            boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.8), inset 0 0 4px rgba(0,0,0,0.5)',
          }}
        >
          {/* OLED screen */}
          <div className="relative h-full w-full bg-black">
            <AnimatePresence mode="wait">
              <motion.picture
                key={screens[index].src}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.8, ease: 'easeInOut' }}
                className="absolute inset-0 h-full w-full"
              >
                <source
                  srcSet={screens[index].src.replace('.jpg', '.webp')}
                  type="image/webp"
                />
                <img
                  src={screens[index].src}
                  alt={screens[index].alt}
                  width={340}
                  height={600}
                  className="h-full w-full object-cover object-top"
                />
              </motion.picture>
            </AnimatePresence>

            {/* Glass reflection */}
            <div
              className="pointer-events-none absolute inset-0 z-10"
              style={{
                background:
                  'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, transparent 40%, transparent 60%, rgba(255,255,255,0.01) 100%)',
              }}
            />
          </div>
        </div>

        {/* Power indicator LED */}
        <div className="absolute bottom-[3px] left-1/2 -translate-x-1/2">
          <div className="h-[3px] w-[3px] rounded-full bg-cyan-400/40 shadow-[0_0_4px_rgba(6,182,212,0.3)]" />
        </div>
      </div>

      {/* Carousel indicator dots */}
      {screens.length > 1 && (
        <div className="mt-4 flex justify-center gap-1.5">
          {screens.map((_, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              aria-label={`Show screen ${i + 1}`}
              className={clsx(
                'h-1.5 rounded-full transition-all duration-300',
                i === index
                  ? 'w-4 bg-cyan-400/70'
                  : 'w-1.5 bg-neutral-600 hover:bg-neutral-500'
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
