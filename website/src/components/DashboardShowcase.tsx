'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { ArrowLeft, ArrowRight, RectangleHorizontal, RectangleVertical } from 'lucide-react';
import { DASHBOARDS } from '@/lib/dashboards';

const INTERVAL_MS = 6000;

type Orientation = 'portrait' | 'landscape';

/** Where each orientation's renders live, and the intrinsic size of one file. */
const RENDERS: Record<Orientation, { dir: string; width: number; height: number; label: string }> =
  {
    portrait: {
      dir: '/images/dashboards',
      width: 640,
      height: 1138,
      label: 'Portrait',
    },
    landscape: {
      dir: '/images/dashboards/landscape',
      width: 1280,
      height: 720,
      label: 'Landscape',
    },
  };
const ORIENTATIONS: Orientation[] = ['portrait', 'landscape'];

/**
 * Homepage showcase: one real dashboard render beside its description, with
 * prev/next, a segmented progress bar, keyboard arrows, and autoplay that
 * pauses while the pointer is over the card. A labelled portrait / landscape
 * switch sits on its own row above the card: every dashboard was rendered in
 * both orientations, so it swaps the image stack and re-flows the card,
 * portrait keeping the screenshot as a fixed-width column beside the copy and
 * landscape stacking the 16:9 render above it.
 */
export function DashboardShowcase() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [orientation, setOrientation] = useState<Orientation>('portrait');
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

  const render = RENDERS[orientation];
  const portrait = orientation === 'portrait';

  return (
    <div>
      <div className="mb-3 flex items-center justify-end gap-3 sm:justify-between">
        <span className="hidden font-plex-mono text-[11.5px] uppercase tracking-[0.08em] text-[#8d99a3] sm:inline">
          Example dashboards
        </span>
        <div
          role="radiogroup"
          aria-label="Screen orientation"
          className="inline-flex gap-[2px] rounded-[10px] border border-[#333] bg-[#111] p-[3px]"
        >
          {ORIENTATIONS.map((o) => (
            <button
              key={o}
              type="button"
              role="radio"
              aria-checked={orientation === o}
              onClick={() => {
                setOrientation(o);
                setCycle((c) => c + 1);
              }}
              className={clsx(
                'inline-flex items-center gap-[7px] rounded-[7px] px-3.5 py-[7px] text-[13px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50',
                orientation === o
                  ? 'bg-[#0f2a31] text-cyan-300 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.35)]'
                  : 'text-neutral-400 hover:text-neutral-200',
              )}
            >
              {o === 'portrait' ? (
                <RectangleVertical className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <RectangleHorizontal className="h-3.5 w-3.5" aria-hidden />
              )}
              <span>
                {RENDERS[o].label}
                <span className="hidden sm:inline">&nbsp;screen</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div
        ref={cardRef}
        className={clsx(
          'grid grid-cols-1 gap-6 rounded-xl border border-[#222] bg-[#161616] p-5 shadow-[0_12px_34px_rgba(0,0,0,0.5)]',
          portrait && 'sm:grid-cols-[260px_1fr] lg:grid-cols-[320px_1fr]',
        )}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={(e) => {
          if (!cardRef.current?.contains(e.relatedTarget as Node | null)) setPaused(false);
        }}
        aria-roledescription="carousel"
        aria-label="Example dashboards"
      >
        {/* Screenshot stack: every image of the active orientation stays mounted
          so switching dashboards is a pure opacity crossfade with no flash of
          empty card. Switching orientation swaps the whole stack. */}
        <figure
          className={clsx(
            'relative m-0 w-full overflow-hidden rounded-md bg-black',
            portrait ? 'aspect-[9/16] max-w-[320px] sm:max-w-none' : 'aspect-video',
          )}
        >
          {DASHBOARDS.map((d, i) => (
            <picture key={`${orientation}-${d.image}`}>
              <source srcSet={`${render.dir}/${d.image}.webp`} type="image/webp" />
              <img
                src={`${render.dir}/${d.image}.jpg`}
                alt={`${d.title} dashboard, ${render.label.toLowerCase()}`}
                width={render.width}
                height={render.height}
                loading={i === index ? 'eager' : 'lazy'}
                decoding="async"
                aria-hidden={i !== index}
                className={clsx(
                  'absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ease-in-out motion-reduce:transition-none',
                  portrait && 'object-top',
                  i === index ? 'opacity-100' : 'opacity-0',
                )}
              />
            </picture>
          ))}
        </figure>

        <div className="flex min-w-0 flex-col">
          {/* Every dashboard's copy is mounted in the same grid cell, invisible
              unless active, so the block is always as tall as the longest entry
              and the navigator below never shifts between scenes. */}
          <div className="grid" aria-live="polite">
            {DASHBOARDS.map((d, i) => (
              <div
                key={d.image}
                aria-hidden={i !== index}
                className={clsx(
                  'col-start-1 row-start-1 flex min-w-0 flex-col gap-2.5',
                  i !== index && 'invisible',
                )}
              >
                <p className="m-0 flex items-baseline justify-between gap-3 whitespace-nowrap font-plex-mono text-[11.5px] uppercase tracking-[0.06em] text-[#8d99a3]">
                  <span>
                    <b className="font-medium text-cyan-400">{String(i + 1).padStart(2, '0')}</b> /{' '}
                    {count}
                  </span>
                  <span>{d.when}</span>
                </p>
                <h2 className="m-0 font-showcase text-[26px] font-bold leading-[1.1] tracking-[-0.01em] text-white">
                  {d.title}
                </h2>
                <p className="m-0 text-[15.5px] leading-[1.55] text-[#c9d1d6]">{d.description}</p>
                <p className="m-0 text-[13px] leading-[1.5] text-[#8d99a3]">
                  <span className="mr-2 inline-block rounded bg-[#0f2a31] px-[7px] py-[2px] font-plex-mono text-[10.5px] uppercase tracking-[0.08em] text-cyan-400">
                    Modules
                  </span>
                  {d.modules.join(', ')}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-auto flex items-center gap-2.5 pt-3.5">
            <NavButton label="Previous dashboard" onClick={() => go(index - 1)}>
              <ArrowLeft className="h-4 w-4" />
            </NavButton>
            <div
              className="flex h-1 flex-1 gap-[3px]"
              role="tablist"
              aria-label="Choose a dashboard"
            >
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
                        paused
                          ? 'animate-showcase-fill [animation-play-state:paused]'
                          : 'animate-showcase-fill',
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
