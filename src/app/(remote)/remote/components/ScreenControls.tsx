'use client';

import type { DisplayStatus } from '@/lib/display-commands';
import { useTranslate } from '@/i18n';

/** Above this many screens the per-screen dots are hidden (they overflow a phone). */
const MAX_DOTS = 12;

interface ScreenNavProps {
  status: DisplayStatus | null;
  onNav: (direction: 'next' | 'prev') => void;
  /** The display is offline (or never connected): nothing would receive the command. */
  disabled?: boolean;
}

export default function ScreenNav({ status, onNav, disabled = false }: ScreenNavProps) {
  const t = useTranslate('remote');
  const screenCount = status?.screenCount ?? 0;
  const currentIndex = status?.currentScreen.index ?? 0;
  const inert = disabled || screenCount === 0;

  return (
    <div className="flex items-center gap-3 mx-5 mt-4">
      <button
        onClick={() => onNav('prev')}
        disabled={inert}
        className="w-12 h-12 rounded-full bg-hs-card border border-hs-border-strong text-hs-text-muted flex items-center justify-center shrink-0 transition-colors active:bg-hs-hover active:scale-95 disabled:opacity-40"
        aria-label={t('screenControls.prevAriaLabel')}
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
      </button>

      {/* The dot strip must never widen the page: `min-w-0 overflow-hidden`
          keeps it inside the viewport, and past MAX_DOTS the dots are dropped
          entirely — the hero already says "Screen X of Y". */}
      <div className="flex-1 min-w-0 overflow-hidden flex justify-center gap-2">
        {screenCount <= MAX_DOTS && Array.from({ length: screenCount }, (_, i) => (
          <div
            key={i}
            className={`h-2 rounded-full transition-all duration-200 ${
              i === currentIndex
                ? 'w-6 bg-hs-accent shadow-[0_0_10px_var(--hs-accent-ring)]'
                : 'w-2 bg-hs-card'
            }`}
          />
        ))}
      </div>

      <button
        onClick={() => onNav('next')}
        disabled={inert}
        className="w-12 h-12 rounded-full bg-hs-card border border-hs-border-strong text-hs-text-muted flex items-center justify-center shrink-0 transition-colors active:bg-hs-hover active:scale-95 disabled:opacity-40"
        aria-label={t('screenControls.nextAriaLabel')}
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      </button>
    </div>
  );
}
