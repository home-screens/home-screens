'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { DASHBOARDS } from '@/lib/dashboards';

const INTERVAL_MS = 6000;

/**
 * Homepage showcase: one real dashboard render beside its description, with
 * prev/next, a segmented progress bar, keyboard arrows, and autoplay that
 * pauses while the pointer is over the card. The card's height comes from the
 * image column, so the navigator stays pinned in the same spot on every scene.
 */
export function DashboardShowcase() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  // Bumped on every user-driven jump so the autoplay interval restarts from
  // a full 6s rather than firing mid-read.
  const [cycle, setCycle] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);

  const count = DASHBOARDS.length;
  const go = useCallback(
    (next: number) => {
      setIndex(((next % count) + count) % count);
      setCycle((c) => c + 1);
    },
    [count],
  );

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % count), INTERVAL_MS);
    return () => clearInterval(id);
  }, [paused, count, cycle]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(index + 1);
      if (e.key === 'ArrowLeft') go(index - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, index]);

  const current = DASHBOARDS[index];

  return (
    <div
      ref={cardRef}
      className="grid grid-cols-1 gap-6 rounded-xl border border-[#222] bg-[#161616] p-5 shadow-[0_12px_34px_rgba(0,0,0,0.5)] sm:grid-cols-[260px_1fr] lg:grid-cols-[320px_1fr]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(e) => {
        if (!cardRef.current?.contains(e.relatedTarget as Node | null)) setPaused(false);
      }}
      aria-roledescription="carousel"
      aria-label="Example dashboards"
    >
      {/* Screenshot stack: every image stays mounted so switching is a pure
          opacity crossfade with no flash of empty card. */}
      <figure className="relative m-0 aspect-[9/16] w-full max-w-[320px] overflow-hidden rounded-md bg-black sm:max-w-none">
        {DASHBOARDS.map((d, i) => (
          <picture key={d.image}>
            <source srcSet={`/images/dashboards/${d.image}.webp`} type="image/webp" />
            <img
              src={`/images/dashboards/${d.image}.jpg`}
              alt={`${d.title} dashboard`}
              width={640}
              height={1138}
              loading={i === 0 ? 'eager' : 'lazy'}
              decoding="async"
              aria-hidden={i !== index}
              className={clsx(
                'absolute inset-0 h-full w-full object-cover object-top transition-opacity duration-500 ease-in-out motion-reduce:transition-none',
                i === index ? 'opacity-100' : 'opacity-0',
              )}
            />
          </picture>
        ))}
      </figure>

      <div className="flex min-w-0 flex-col gap-2.5" aria-live="polite">
        <p className="m-0 flex items-baseline justify-between gap-3 whitespace-nowrap font-plex-mono text-[11.5px] uppercase tracking-[0.06em] text-[#8d99a3]">
          <span>
            <b className="font-medium text-cyan-400">{String(index + 1).padStart(2, '0')}</b> / {count}
          </span>
          <span>{current.when}</span>
        </p>
        <h2 className="m-0 font-showcase text-[26px] font-bold leading-[1.1] tracking-[-0.01em] text-white">
          {current.title}
        </h2>
        <p className="m-0 text-[15.5px] leading-[1.55] text-[#c9d1d6]">{current.description}</p>
        <p className="m-0 text-[13px] leading-[1.5] text-[#8d99a3]">
          <span className="mr-2 inline-block rounded bg-[#0f2a31] px-[7px] py-[2px] font-plex-mono text-[10.5px] uppercase tracking-[0.08em] text-cyan-400">
            Modules
          </span>
          {current.modules.join(', ')}
        </p>

        <div className="mt-auto flex items-center gap-2.5 pt-3.5">
          <NavButton label="Previous dashboard" onClick={() => go(index - 1)}>
            <ArrowLeft className="h-4 w-4" />
          </NavButton>
          <div className="flex h-1 flex-1 gap-[3px]" role="tablist" aria-label="Choose a dashboard">
            {DASHBOARDS.map((d, i) => (
              <button
                key={d.image}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`${i + 1}. ${d.title}`}
                onClick={() => go(i)}
                className={clsx(
                  'relative flex-1 overflow-hidden rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50',
                  i < index ? 'bg-[#404040]' : 'bg-[#262626]',
                )}
              >
                {i === index && (
                  <span
                    // Remount per cycle so the fill restarts whenever the user jumps.
                    key={cycle}
                    className={clsx(
                      'absolute inset-0 origin-left bg-cyan-400 motion-reduce:animate-none motion-reduce:scale-x-100',
                      paused ? 'animate-showcase-fill [animation-play-state:paused]' : 'animate-showcase-fill',
                    )}
                  />
                )}
              </button>
            ))}
          </div>
          <NavButton label="Next dashboard" onClick={() => go(index + 1)}>
            <ArrowRight className="h-4 w-4" />
          </NavButton>
        </div>
      </div>
    </div>
  );
}

function NavButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-lg border border-[#333] text-neutral-200 transition-colors hover:border-cyan-400/50 hover:text-cyan-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
    >
      {children}
    </button>
  );
}
