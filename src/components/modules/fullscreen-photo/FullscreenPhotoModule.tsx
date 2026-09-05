'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import type { FullscreenPhotoConfig, MediaListItem, ModuleStyle, TimeFormat } from '@/types/config';
import { useFetchData } from '@/hooks/useFetchData';
import { photoSlideshowUrl, FETCH_KEY_REGISTRY } from '@/lib/fetch-keys';
import { useMediaRotation } from '@/hooks/useRotatingIndex';
import { useAuthImage } from '@/components/display/useAuthImage';
import { useTZClock } from '@/hooks/useTZClock';
import { getThemeTokens } from '@/lib/fullscreen-themes';
import { useFormattingLocale, useTranslate, type TranslateFn } from '@/i18n';
import { useOrigin } from '@/hooks/useOrigin';
import { phoneSurfaceLabel, phoneSurfaceUrl } from '@/lib/phone-surfaces';
import type { FullscreenThemeTokens } from '@/lib/fullscreen-themes';
import { QRCodeSVG } from 'qrcode.react';
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
  // Never render the previous slide's blob on an already-active layer —
  // the layer stays hidden until its own image is ready.
  const authSrc = useAuthImage(src, { holdPrevious: false });

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

// ── Empty state ──────────────────────────────

function PhotoFrameIcon({ color }: { color: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke={color} style={{ width: 110, height: 110 }} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
    </svg>
  );
}

/**
 * The wall's "no photos yet" screen. Sized for the 1080x1920 canvas in plain
 * px (the canvas is scaled as a whole in the editor, so vw would lie there):
 * readable from the couch, with the hub's real /remote address in a pill and
 * a QR code a phone can scan. Cloud sources get their own hint instead: their
 * fix is in the editor, not on a phone.
 */
function NoPhotosYet({ theme, t, cloudHint }: { theme: FullscreenThemeTokens; t: TranslateFn; cloudHint: string | null }) {
  const origin = useOrigin();
  const url = phoneSurfaceUrl('remote', origin);
  return (
    <div className="flex flex-col items-center text-center" style={{ gap: 24, padding: '0 80px', color: theme.textMuted }}>
      <PhotoFrameIcon color={theme.textMuted} />
      <p style={{ fontSize: 52, fontWeight: 600, lineHeight: 1.15, color: theme.text }}>{t('fullscreen-photo.noPhotosYet')}</p>
      {cloudHint ? (
        <p style={{ fontSize: 30, lineHeight: 1.35, maxWidth: 760 }}>{cloudHint}</p>
      ) : (
        <>
          <p style={{ fontSize: 30, lineHeight: 1.35 }}>{t('fullscreen-photo.noPhotosYetHint')}</p>
          <code
            data-testid="fullscreen-photo-remote-url"
            className="font-mono break-all"
            style={{ fontSize: 34, padding: '14px 30px', borderRadius: 999, background: theme.surface, color: theme.text, maxWidth: '100%' }}
          >
            {phoneSurfaceLabel('remote', origin)}
          </code>
          {/* A QR of a bare path is useless, so it waits for the origin. Always
              dark on white: that scans under every theme. */}
          {origin && (
            <div style={{ background: '#fff', padding: 16, borderRadius: 16, marginTop: 10, lineHeight: 0 }}>
              <QRCodeSVG value={url} size={260} fgColor="#111111" bgColor="#ffffff" />
            </div>
          )}
          <p style={{ fontSize: 24, marginTop: 8 }}>{t('fullscreen-photo.noPhotosYetFolderHint')}</p>
        </>
      )}
    </div>
  );
}

// ── Clock overlay ────────────────────────────

function ClockOverlay({ theme, timezone, timeFormat }: { theme: FullscreenThemeTokens; timezone?: string; timeFormat?: TimeFormat }) {
  // Display-timezone clock, not browser-local — the Pi's OS timezone may differ
  const time = useTZClock(timezone, 1000);
  const locale = useFormattingLocale();

  // The household's 12/24 choice when it has made one. Otherwise resolve the
  // locale's hour cycle from Intl rather than guessing on the language tag —
  // this gets en-GB (24h) and fr-CA (24h) right, and the 12/24 picker stores
  // nothing for 12h, so "absent" must not be read as "chose 12h" or every
  // 24-hour locale would flip to AM/PM without anyone touching a setting.
  const cycle = new Intl.DateTimeFormat(locale, { hour: 'numeric' }).resolvedOptions().hourCycle;
  const is12Hour = timeFormat ? timeFormat === '12h' : (cycle === 'h11' || cycle === 'h12');
  const hours = is12Hour ? (time.getHours() % 12 || 12) : time.getHours();
  const minutes = time.getMinutes().toString().padStart(2, '0');
  const ampm = is12Hour ? (time.getHours() >= 12 ? 'PM' : 'AM') : null;
  const dateStr = time.toLocaleDateString(locale, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  // The scrim always runs the opposite way from the theme's text, because the
  // photo underneath can be any brightness. Dark themes darken the bottom of
  // the frame and write light text on it; light themes lighten it and write
  // dark text. `textSecondary`, not `textMuted`, carries the second line;
  // several themes' muted tone is far too low-contrast to read across a room.
  const scrim = theme.isDark
    ? 'linear-gradient(to top, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.25) 60%, transparent 100%)'
    : 'linear-gradient(to top, rgba(255,255,255,0.72) 0%, rgba(255,255,255,0.38) 60%, transparent 100%)';
  const textColor = theme.text;
  const textMuted = theme.textSecondary;

  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-10 flex flex-col items-start px-10 pb-10"
      style={{ background: scrim }}
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
  /** Household 12/24 choice, threaded by buildModuleProps. */
  timeFormat?: TimeFormat;
  // Threaded by ScreenRenderer on real displays only; the editor preview gets
  // neither, so video slides show posters and rotate on the photo timer there.
  screenId?: string;
  moduleId?: string;
}

export default function FullscreenPhotoModule({ config, timezone, fullscreenTheme, timeFormat, screenId, moduleId }: FullscreenPhotoModuleProps) {
  const t = useTranslate('modules');
  const containerRef = useRef<HTMLDivElement>(null);

  const isSinglePhoto = config.file !== undefined;
  const playVideos = !!(screenId && moduleId);

  // Fetch photo list (reuses same API as photo-slideshow) — skip when single photo.
  // Photo-only configs receive the legacy string[] response; normalize both
  // shapes into MediaListItem so the render path below is uniform.
  const listUrl = isSinglePhoto ? '' : photoSlideshowUrl(config);
  const [data] = useFetchData<string[] | MediaListItem[]>(listUrl, FETCH_KEY_REGISTRY['fullscreen-photo']?.ttlMs ?? 600_000);
  const items = useMemo<MediaListItem[]>(
    () => (data ?? []).map((entry) => (typeof entry === 'string' ? { url: entry, type: 'image' as const } : entry)),
    [data],
  );

  const intervalMs = config.intervalMs ?? 30000;
  // Per-item rotation: photos advance on the timer, videos on onEnded —
  // an all-photo list degenerates to the plain fixed-interval rotation.
  // The list URL keys the batch, so a periodic refresh is held until the
  // current pass completes instead of re-dealing mid-slideshow.
  const [files, photoIndex, advance] = useMediaRotation(isSinglePhoto ? NO_ITEMS : items, intervalMs, config.shuffle ?? false, playVideos, listUrl);

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

  // The one full-screen module whose last-resort theme is dark. The others
  // fall through to `getThemeTokens`, which defaults to `linen`, and the
  // per-display override UI advertises linen as the default for that reason.
  // Photos are the exception on purpose: the frame this theme paints (the
  // letterbox bars, the empty and loading screens, the clock scrim) sits
  // against a photograph, and a pale frame around a photo reads as a mistake
  // where a dark one reads as a mount. A household that wants linen here sets
  // it, per module or per display, and this only applies when neither is set.
  const themeId = config.theme ?? fullscreenTheme ?? 'midnight';
  const theme = getThemeTokens(themeId);
  // Photos are edge to edge, so the theme paints the frame around them: the
  // empty/loading screens, the letterbox bars an `objectFit: contain` photo
  // leaves behind, and the clock overlay's scrim and text.
  const themeGround = { backgroundColor: theme.bg, backgroundImage: theme.bgImage ?? 'none' };

  if (isSinglePhoto) {
    if (!config.file) {
      // Mode is set but no photo chosen yet
      return (
        <div
          ref={containerRef}
          className="w-full h-full flex items-center justify-center"
          style={{ ...themeGround, color: theme.textSecondary }}
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
      <div ref={containerRef} className="relative w-full h-full overflow-hidden" style={themeGround}>
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
          <ClockOverlay theme={theme} timezone={timezone} timeFormat={timeFormat} />
        )}
      </div>
    );
  }

  if (data !== null && items.length === 0) {
    // An empty iCloud album usually means a bad link or the album's public
    // website being off; an empty OneDrive folder points back at the
    // editor's folder picker — say so instead of phone-upload advice.
    const cloudHint = config.source === 'icloud' ? t('fullscreen-photo.noPhotosYetHintICloud')
      : config.source === 'onedrive' ? t('fullscreen-photo.noPhotosYetHintOneDrive')
        : null;
    return (
      <div
        ref={containerRef}
        className="w-full h-full flex items-center justify-center"
        style={{ ...themeGround, color: theme.textSecondary }}
      >
        <NoPhotosYet theme={theme} t={t} cloudHint={cloudHint} />
      </div>
    );
  }

  if (data === null) {
    return (
      <div
        ref={containerRef}
        className="w-full h-full flex items-center justify-center"
        style={themeGround}
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
    <div ref={containerRef} className="relative w-full h-full overflow-hidden" style={themeGround}>
      <style>{KEN_BURNS_CSS}</style>

      {/* Layer 0 */}
      {renderLayer(0)}
      {/* Layer 1 */}
      {renderLayer(1)}

      {/* Clock overlay */}
      {config.showClock && (
        <ClockOverlay theme={theme} timezone={timezone} timeFormat={timeFormat} />
      )}
    </div>
  );
}
