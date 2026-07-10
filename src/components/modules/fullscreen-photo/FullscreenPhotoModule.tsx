'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import type { FullscreenPhotoConfig, MediaListItem, ModuleStyle } from '@/types/config';
import { useFetchData } from '@/hooks/useFetchData';
import { photoSlideshowUrl, FETCH_KEY_REGISTRY } from '@/lib/fetch-keys';
import { useMediaRotation } from '@/hooks/useRotatingIndex';
import { useAuthImage } from '@/components/display/useAuthImage';
import { useTZClock } from '@/hooks/useTZClock';
import { getThemeTokens } from '@/lib/fullscreen-themes';
import { useFormattingLocale, useTranslate } from '@/i18n';
import VideoLayer from '../shared/VideoLayer';

const DEFAULT_MAX_VIDEO_DURATION_MS = 60_000;
const NO_ITEMS: MediaListItem[] = [];

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

function ClockOverlay({ textColor, textMuted, timezone }: { textColor: string; textMuted: string; timezone?: string }) {
  // Display-timezone clock, not browser-local — the Pi's OS timezone may differ
  const time = useTZClock(timezone, 1000);
  const locale = useFormattingLocale();

  // Resolve the locale's hour cycle from Intl rather than guessing on the
  // language tag — this gets en-GB (24h) and fr-CA (24h) right.
  const cycle = new Intl.DateTimeFormat(locale, { hour: 'numeric' }).resolvedOptions().hourCycle;
  const is12Hour = cycle === 'h11' || cycle === 'h12';
  const hours = is12Hour ? (time.getHours() % 12 || 12) : time.getHours();
  const minutes = time.getMinutes().toString().padStart(2, '0');
  const ampm = is12Hour ? (time.getHours() >= 12 ? 'PM' : 'AM') : null;
  const dateStr = time.toLocaleDateString(locale, {
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
        {ampm !== null && (
          <span
            className="font-medium leading-none"
            style={{ color: textMuted, fontSize: 'min(3.5vw, 28px)' }}
          >
            {ampm}
          </span>
        )}
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

// ── Main component ───────────────────────────

interface FullscreenPhotoModuleProps {
  config: FullscreenPhotoConfig;
  style: ModuleStyle;
  timezone?: string;
  fullscreenTheme?: string;
  // Threaded by ScreenRenderer on real displays only; the editor preview gets
  // neither, so video slides show posters and rotate on the photo timer there.
  screenId?: string;
  moduleId?: string;
}

export default function FullscreenPhotoModule({ config, timezone, fullscreenTheme, screenId, moduleId }: FullscreenPhotoModuleProps) {
  const t = useTranslate('modules');
  const containerRef = useRef<HTMLDivElement>(null);

  const isSinglePhoto = config.file !== undefined;
  const playVideos = !!(screenId && moduleId);

  // Fetch photo list (reuses same API as photo-slideshow) — skip when single photo.
  // Photo-only configs receive the legacy string[] response; normalize both
  // shapes into MediaListItem so the render path below is uniform.
  const [data] = useFetchData<string[] | MediaListItem[]>(isSinglePhoto ? '' : photoSlideshowUrl(config), FETCH_KEY_REGISTRY['fullscreen-photo']?.ttlMs ?? 600_000);
  const items = useMemo<MediaListItem[]>(
    () => (data ?? []).map((entry) => (typeof entry === 'string' ? { url: entry, type: 'image' as const } : entry)),
    [data],
  );
  const files = items;

  const intervalMs = config.intervalMs ?? 30000;
  // Per-item rotation: photos advance on the timer, videos on onEnded —
  // an all-photo list degenerates to the plain fixed-interval rotation.
  const [photoIndex, advance] = useMediaRotation(isSinglePhoto ? NO_ITEMS : items, intervalMs, config.shuffle ?? false, playVideos);

  // Dual-layer crossfade state
  const [activeLayer, setActiveLayer] = useState(0);
  const [sources, setSources] = useState<[MediaListItem | null, MediaListItem | null]>([null, null]);
  const prevIndexRef = useRef(photoIndex);

  useEffect(() => {
    if (isSinglePhoto || files.length === 0) return;
    const item = files[photoIndex];

    if (prevIndexRef.current !== photoIndex) {
      const nextLayer = activeLayer === 0 ? 1 : 0;
      setSources((prev) => {
        const updated: [MediaListItem | null, MediaListItem | null] = [...prev] as [MediaListItem | null, MediaListItem | null];
        updated[nextLayer] = item;
        return updated;
      });
      setActiveLayer(nextLayer);
      prevIndexRef.current = photoIndex;
    } else {
      setSources([item, item]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- activeLayer and prevIndexRef are internal state managed by this effect, not external deps
  }, [photoIndex, files, isSinglePhoto]);

  // Theme
  const themeId = config.theme ?? fullscreenTheme ?? 'midnight';
  const theme = getThemeTokens(themeId);

  // Single photo mode — render directly, no fetch or rotation needed
  if (isSinglePhoto) {
    if (!config.file) {
      // Mode is set but no photo chosen yet
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
            <p className="text-lg font-medium" style={{ color: theme.text }}>{t('fullscreen-photo.noPhotoSelected')}</p>
            <p className="text-sm max-w-xs mx-auto" style={{ color: theme.textMuted }}>
              {t('fullscreen-photo.noPhotoSelectedHint')}
            </p>
          </div>
        </div>
      );
    }
    return (
      <div ref={containerRef} className="relative w-full h-full overflow-hidden" style={{ backgroundColor: '#000' }}>
        {config.kenBurns && <style>{KEN_BURNS_CSS}</style>}
        <SlideLayer
          src={config.file}
          active
          objectFit={config.objectFit}
          transition="none"
          kenBurns={config.kenBurns ?? false}
          layerIndex={0}
        />
        {config.showClock && (
          <ClockOverlay textColor="#ffffff" textMuted="rgba(255,255,255,0.75)" timezone={timezone} />
        )}
      </div>
    );
  }

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
          <p className="text-lg font-medium" style={{ color: theme.text }}>{t('fullscreen-photo.noPhotosYet')}</p>
          <p className="text-sm max-w-xs mx-auto" style={{ color: theme.textMuted }}>
            {t('fullscreen-photo.noPhotosYetHint')}
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

  // Cut (never animate) when either neighbor of the transition is a video —
  // a transition would run two decoders at once, which Pi hardware can't
  // afford; Ken Burns (a CSS transform on a decoding surface) is skipped too.
  const videoAdjacent = sources.some((s) => s?.type === 'video');
  const transition = videoAdjacent ? 'none' : config.transition;

  const renderLayer = (layer: 0 | 1) => {
    const item = sources[layer];
    if (!item) return null;
    const active = activeLayer === layer;
    if (item.type === 'video') {
      return (
        <VideoLayer
          src={item.url}
          posterSrc={item.posterUrl}
          active={active}
          autoPlay={playVideos}
          objectFit={config.objectFit}
          muted
          loop={files.length === 1}
          maxDurationMs={config.maxVideoDurationMs ?? DEFAULT_MAX_VIDEO_DURATION_MS}
          onEnded={advance}
        />
      );
    }
    return (
      <SlideLayer
        src={item.url}
        active={active}
        objectFit={config.objectFit}
        transition={transition}
        kenBurns={(config.kenBurns ?? false) && !videoAdjacent}
        layerIndex={layer}
      />
    );
  };

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden" style={{ backgroundColor: '#000' }}>
      <style>{KEN_BURNS_CSS}</style>

      {/* Layer 0 */}
      {renderLayer(0)}
      {/* Layer 1 */}
      {renderLayer(1)}

      {/* Clock overlay */}
      {config.showClock && (
        <ClockOverlay textColor="#ffffff" textMuted="rgba(255,255,255,0.75)" timezone={timezone} />
      )}
    </div>
  );
}
