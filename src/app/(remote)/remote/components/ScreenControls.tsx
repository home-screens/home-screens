'use client';

import type { DisplayStatus } from '@/lib/display-commands';

interface ScreenNavProps {
  status: DisplayStatus | null;
  onNav: (direction: 'next' | 'prev') => void;
}

export default function ScreenNav({ status, onNav }: ScreenNavProps) {
  const screenCount = status?.screenCount ?? 0;
  const currentIndex = status?.currentScreen.index ?? 0;

  return (
    <div className="flex items-center gap-3 mx-5 mt-4">
      <button
        onClick={() => onNav('prev')}
        disabled={screenCount === 0}
        className="w-12 h-12 rounded-full bg-white/[0.03] border border-white/[0.06] text-neutral-400 flex items-center justify-center shrink-0 transition-colors active:bg-white/[0.08] active:scale-95 disabled:opacity-40"
        aria-label="Previous screen"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
      </button>

      <div className="flex-1 flex justify-center gap-2">
        {Array.from({ length: screenCount }, (_, i) => (
          <div
            key={i}
            className={`h-2 rounded-full transition-all duration-200 ${
              i === currentIndex
                ? 'w-6 bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.3)]'
                : 'w-2 bg-neutral-600'
            }`}
          />
        ))}
      </div>

      <button
        onClick={() => onNav('next')}
        disabled={screenCount === 0}
        className="w-12 h-12 rounded-full bg-white/[0.03] border border-white/[0.06] text-neutral-400 flex items-center justify-center shrink-0 transition-colors active:bg-white/[0.08] active:scale-95 disabled:opacity-40"
        aria-label="Next screen"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      </button>
    </div>
  );
}
