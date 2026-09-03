'use client';

import { motion, useInView } from 'framer-motion';
import { useRef, type ReactNode } from 'react';

/**
 * The one reveal-on-scroll animation the marketing pages use. Wrap a block
 * in it and the block fades and rises the first time it scrolls into view.
 *
 * Every marketing section used to carry its own useRef + useInView +
 * motion.div copy of this, with the same numbers. Keeping it here means one
 * place to tune the motion, and the sections themselves can stay server
 * components.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 12,
  /** Animate on mount instead of on scroll (the hero, which is above the fold). */
  immediate = false,
  /** How far past the edge the block has to be before it counts as in view. */
  margin = '-40px',
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  immediate?: boolean;
  margin?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: margin as never });
  const shown = immediate || isInView;

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y }}
      animate={shown ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}
