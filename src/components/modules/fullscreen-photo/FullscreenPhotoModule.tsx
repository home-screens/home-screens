'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import type { FullscreenPhotoConfig, ModuleStyle } from '@/types/config';
import { useFetchData } from '@/hooks/useFetchData';
import { photoSlideshowUrl } from '@/lib/fetch-keys';
import { useAuthImage } from '@/components/display/useAuthImage';
import { getThemeTokens } from '@/lib/fullscreen-themes';

// ── Ken Burns keyframes (injected once) ──────

const KEN_BURNS_CSS = `
@keyframes kb-a {
  0%   { transform: scale(1)    translate(0, 0); }
  100% { transform: scale(1.15) translate(-2%, -1%); }
}
@keyframes kb-b {
  0%   { transform: scale(1.05) translate(1%, 0); }
  100% { transform: scale(1.18) translate(-1%, -2%); }
}
`;

// ── Slide layer ──────────────────────────────

function SlideLayer({
  src,
  active,
  objectFit,
  transition,
  kenBurns,
  layerIndex,
}: {
  src: string;
  active: boolean;
  objectFit?: React.CSSProperties['objectFit'];
  transition: FullscreenPhotoConfig['transition'];
  kenBurns: boolean;
  layerIndex: number;
}) {
  const authSrc = useAuthImage(src);

  const transitionStyle = useMemo((): React.CSSProperties => {
    const base: React.CSSProperties = {
      objectFit,
      zIndex: active ? 1 : 0,
      visibility: authSrc ? 'visible' : 'hidden',
    };

    switch (transition) {
      case 'fade':
        return {
          ...base,
          opacity: active && authSrc ? 1 : 0,
          transition: 'opacity 1200ms ease-in-out',
        };
      case 'slide':
        return {
          ...base,
          opacity: active && authSrc ? 1 : 0,
          transform: active ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 800ms ease-in-out, opacity 800ms ease-in-out',
        };
      case 'zoom':
        return {
          ...base,
          opacity: active && authSrc ? 1 : 0,
          transform: active ? 'scale(1)' : 'scale(1.3)',
          transition: 'transform 1000ms ease-out, opacity 600ms ease-in-out',
        };
      case 'none':
      default:
        return {
          ...base,
          opacity: active && authSrc ? 1 : 0,
        };
    }
  }, [active, authSrc, objectFit, transition]);

  const kenBurnsStyle = useMemo((): React.CSSProperties => {
    if (!kenBurns || !active) return {};
    return {
      animation: `${layerIndex === 0 ? 'kb-a' : 'kb-b'} 20s ease-in-out alternate infinite`,
    };
  }, [kenBurns, active, layerIndex]);

  return (
    <img
      src={authSrc || undefined}
      alt=""
      className="absolute inset-0 w-full h-full"
      style={{ ...transitionStyle, ...kenBurnsStyle }}
    />
  );
}

// ── Clock overlay ────────────────────────────

function ClockOverlay({ textColor, textMuted }: { textColor: string; textMuted: string }) {
  const [time, setTime] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const hours = time.getHours() % 12 || 12;
  const minutes = time.getMinutes().toString().padStart(2, '0');
  const ampm = time.getHours() >= 12 ? 'PM' : 'AM';
  const dateStr = time.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-10 flex flex-col items-start px-10 pb-10"
      style={{
        background: 'linear-gradient(to top, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.25) 60%, transparent 100%)',
      }}
    >
      <div className="flex items-baseline gap-2 pt-16">
        <span
          className="font-light tracking-tight leading-none"
          style={{ color: textColor, fontSize: 'min(12vw, 96px)' }}
        >
          {hours}:{minutes}
        </span>
        <span
          className="font-medium leading-none"
          style={{ color: textMuted, fontSize: 'min(3.5vw, 28px)' }}
        >
          {ampm}
        </span>
      </div>
      <span
        className="font-normal mt-1 leading-none"
        style={{ color: textMuted, fontSize: 'min(3vw, 22px)' }}
      >
        {dateStr}
      </span>
    </div>
  );
}

// ── Shuffled index hook ──────────────────────

function shuffleArray(arr: number[]): number[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function useShuffledRotatingIndex(count: number, intervalMs: number, shuffle: boolean): number {
  const [index, setIndex] = useState(0);
  const [order, setOrder] = useState<number[]>([]);

  // Build or rebuild the order whenever count or shuffle changes
  useEffect(() => {
    if (count <= 0) {
      setOrder([]);
      setIndex(0);
      return;
    }
    const arr = Array.from({ length: count }, (_, i) => i);
    setOrder(shuffle ? shuffleArray(arr) : arr);
    setIndex(0);
  }, [count, shuffle]);

  useEffect(() => {
    if (count <= 1) return;
    const id = setInterval(() => {
      setIndex((prev) => {
        const next = prev + 1;
        if (next >= count) {
          // Reshuffle for next cycle
          if (shuffle) {
            setOrder((prevOrder) => shuffleArray(prevOrder));
          }
          return 0;
        }
        return next;
      });
    }, intervalMs);
    return () => clearInterval(id);
  }, [count, intervalMs, shuffle]);

  if (count <= 0 || order.length === 0) return 0;
  return order[index % order.length] ?? 0;
}

// ── Main component ───────────────────────────

interface FullscreenPhotoModuleProps {
  config: FullscreenPhotoConfig;
  style: ModuleStyle;
  fullscreenTheme?: string;
}

export default function FullscreenPhotoModule({ config, fullscreenTheme }: FullscreenPhotoModuleProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch photo list (reuses same API as photo-slideshow)
  const [data] = useFetchData<string[]>(photoSlideshowUrl(config), 600000);
  const files = data ?? [];

  const intervalMs = config.intervalMs ?? 30000;
  const photoIndex = useShuffledRotatingIndex(files.length, intervalMs, config.shuffle ?? false);

  // Dual-layer crossfade state
  const [activeLayer, setActiveLayer] = useState(0);
  const [sources, setSources] = useState<[string, string]>(['', '']);
  const prevIndexRef = useRef(photoIndex);

  useEffect(() => {
    if (files.length === 0) return;
    const src = files[photoIndex];

    if (prevIndexRef.current !== photoIndex) {
      const nextLayer = activeLayer === 0 ? 1 : 0;
      setSources((prev) => {
        const updated: [string, string] = [...prev] as [string, string];
        updated[nextLayer] = src;
        return updated;
      });
      setActiveLayer(nextLayer);
      prevIndexRef.current = photoIndex;
    } else {
      setSources([src, src]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoIndex, files]);

  // Theme
  const themeId = config.theme ?? fullscreenTheme ?? 'midnight';
  const theme = getThemeTokens(themeId);

  // Empty state
  if (data !== null && files.length === 0) {
    return (
      <div
        ref={containerRef}
        className="w-full h-full flex items-center justify-center"
        style={{ backgroundColor: theme.bg, color: theme.textSecondary }}
      >
        <div className="text-center space-y-3">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" className="w-16 h-16 mx-auto opacity-30">
            <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
          </svg>
          <p className="text-lg font-medium" style={{ color: theme.text }}>No photos yet</p>
          <p className="text-sm max-w-xs mx-auto" style={{ color: theme.textMuted }}>
            Upload photos from your phone using the Photos tab at /remote, or choose a folder in the editor.
          </p>
        </div>
      </div>
    );
  }

  // Loading state
  if (data === null) {
    return (
      <div
        ref={containerRef}
        className="w-full h-full flex items-center justify-center"
        style={{ backgroundColor: theme.bg }}
      >
        <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: theme.border, borderTopColor: theme.text }} />
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden" style={{ backgroundColor: '#000' }}>
      <style>{KEN_BURNS_CSS}</style>

      {/* Layer 0 */}
      {sources[0] && (
        <SlideLayer
          src={sources[0]}
          active={activeLayer === 0}
          objectFit={config.objectFit}
          transition={config.transition}
          kenBurns={config.kenBurns ?? false}
          layerIndex={0}
        />
      )}
      {/* Layer 1 */}
      {sources[1] && (
        <SlideLayer
          src={sources[1]}
          active={activeLayer === 1}
          objectFit={config.objectFit}
          transition={config.transition}
          kenBurns={config.kenBurns ?? false}
          layerIndex={1}
        />
      )}

      {/* Clock overlay */}
      {config.showClock && (
        <ClockOverlay textColor="#ffffff" textMuted="rgba(255,255,255,0.75)" />
      )}
    </div>
  );
}
