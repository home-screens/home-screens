'use client';

import { useCallback, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { usePanelSectionReveal } from './panel-section-reveal';

export default function AccordionSection({ title, defaultOpen = true, badge, id, children }: {
  title: string;
  defaultOpen?: boolean;
  /** Optional right-aligned summary, so a collapsed section can't hide state. */
  badge?: React.ReactNode;
  /** Registers the section so `revealPanelSection(id)` can open it from elsewhere in the panel. */
  id?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [flash, setFlash] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Open and bring the heading into view once the height animation has
  // settled, so the scroll lands on the final layout rather than mid-slide,
  // then mark the section for a moment: "this is the part you were sent to".
  const reveal = useCallback(() => {
    setOpen(true);
    setTimeout(() => {
      rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setFlash(true);
      setTimeout(() => setFlash(false), 1_400);
    }, 250);
  }, []);
  usePanelSectionReveal(id, reveal);

  return (
    <div
      ref={rootRef}
      data-panel-section={id}
      data-revealed={flash ? '' : undefined}
      className={`rounded-md transition-shadow duration-500 ${flash ? 'ring-2 ring-hs-accent/60' : 'ring-0 ring-transparent'}`}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 w-full py-1.5 text-left group"
      >
        <ChevronRight
          className={`w-3 h-3 text-hs-text-faint transition-transform duration-200 ${
            open ? 'rotate-90' : ''
          }`}
        />
        <span className="text-xs font-semibold text-hs-text-faint uppercase">{title}</span>
        {badge != null && (
          <span className="ml-auto rounded-full bg-hs-card px-2 py-0.5 text-[10px] text-hs-text-faint">{badge}</span>
        )}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            // `clip`, not `hidden`: while the height animates, a `hidden`
            // wrapper is a scroll container, and anything that scrolls a child
            // into view (focus, scrollIntoView, a test's hover) drags this box
            // instead of the panel. The offset then unwinds as the height
            // reaches auto, sliding the contents down mid-interaction.
            className="overflow-clip"
          >
            <div className="space-y-3 pb-2">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
