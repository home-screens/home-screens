'use client';

import { useRef, useState } from 'react';
import type { FullscreenPhotoConfig, ModuleStyle, TimeFormat } from '@/types/config';
import { isSinglePhotoMode } from '@/lib/fullscreen-photo-mode';
import { useTZClock } from '@/hooks/useTZClock';
import { photoThemeTokens, clockOverlayPaint, type ClockBackdropSettings } from '@/lib/fullscreen-photo-theme';
import { useBurnInProtection } from '@/components/display/burn-in-context';
import { useElementBox } from '@/hooks/useElementBox';
import { useWander } from '@/hooks/usePixelShift';
import { WANDER_REACH_X_PX, WANDER_REACH_Y_PX } from '@/lib/pixel-shift';
import { useFormattingLocale, useTranslate, type TranslateFn } from '@/i18n';
import { useOrigin } from '@/hooks/useOrigin';
import { phoneSurfaceLabel, phoneSurfaceUrl } from '@/lib/phone-surfaces';
import type { FullscreenThemeTokens } from '@/lib/fullscreen-themes';
import { QRCodeSVG } from 'qrcode.react';
import { usePhotoList, DEFAULT_SLIDE_INTERVAL_MS } from '../shared/usePhotoList';
import { SlideImage, SlideLayer, KEN_BURNS_CSS } from '../shared/SlideImage';
import type { LayerIndex } from '../shared/useCrossfadeLayers';
import type { PictureBox } from '@/lib/media-paths';
import { householdTimeFormat } from '@/lib/clock-time';
import { emptyStateFor, normalizePhotoSource, type PhotoSourceEmptyReason, defaultPhotoSource } from '@/lib/photo-source';
import PhotoCredit from '../shared/PhotoCredit';
import { PhotoControls, photoAlbumName } from '../shared/PhotoControls';
import { useSetupSentence } from '../ModuleStates';
import { useModuleSurface } from '../module-surface';

/** The editor-side fix an empty source's wall names (`emptyStateFor`); an empty library folder shows the phone address instead. */
const CLOUD_HINT: Record<Exclude<PhotoSourceEmptyReason, 'addPhotos'>, string> = {
  pickPictures: 'fullscreen-photo.noPhotosYetHintPicked',
  checkFilters: 'fullscreen-photo.noPhotosYetHintImmich',
  checkLink: 'fullscreen-photo.noPhotosYetHintICloud',
  checkFolder: 'fullscreen-photo.noPhotosYetHintOneDrive',
  checkSearch: 'fullscreen-photo.noPhotosYetHintUnsplash',
  checkArt: 'fullscreen-photo.noPhotosYetHintArt',
  tryLater: 'fullscreen-photo.noPhotosYetHintNasa',
};

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
function NoPhotosYet({ theme, t, title, cloudHint, footer }: { theme: FullscreenThemeTokens; t: TranslateFn; title?: string; cloudHint: string | null; footer?: string }) {
  const origin = useOrigin();
  const url = phoneSurfaceUrl('remote', origin);
  return (
    <div className="flex flex-col items-center text-center" style={{ gap: 24, padding: '0 80px', color: theme.textMuted }}>
      <PhotoFrameIcon color={theme.textMuted} />
      <p style={{ fontSize: 52, fontWeight: 600, lineHeight: 1.15, color: theme.text }}>{title ?? t('fullscreen-photo.noPhotosYet')}</p>
      {cloudHint ? (
        <>
          <p style={{ fontSize: 30, lineHeight: 1.35, maxWidth: 760 }}>{cloudHint}</p>
          {footer && <p style={{ fontSize: 24, marginTop: 8 }}>{footer}</p>}
        </>
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

function ClockOverlay({ theme, backdrop, timezone, timeFormat }: { theme: FullscreenThemeTokens; backdrop: ClockBackdropSettings; timezone?: string; timeFormat?: TimeFormat }) {
  // Display-timezone clock, not browser-local: the Pi's OS timezone may differ.
  // The overlay shows minutes only, so it ticks on the minute (aligned, see
  // useTZClock), not every second.
  const time = useTZClock(timezone, 60_000);
  const locale = useFormattingLocale();

  // Burn-in protection: the text block drifts inside the band, a pixel a
  // minute on the same tick as the time, as far as the band has room for
  // (its inner width less the text, halved, capped at the reach). The
  // whole-wall shift only reaches 6 px, which blurs the digits' edges and
  // leaves their cores lit; the band has tens of pixels to spare. Until the
  // band is measured (the server render, the first client frame) the full
  // reach is assumed: a full-width wall, the usual case, then paints its
  // first frame where the clock stays instead of jumping once measured.
  const protect = useBurnInProtection();
  const [bandRef, band] = useElementBox();
  const [textRef, text] = useElementBox();
  const reachX = band.width > 0 && text.width > 0
    ? Math.max(0, Math.min(WANDER_REACH_X_PX, Math.floor((band.width - text.width) / 2)))
    : WANDER_REACH_X_PX;
  const wander = useWander(protect, reachX, WANDER_REACH_Y_PX);

  const is12Hour = householdTimeFormat(timeFormat, locale) === '12h';
  const hours = is12Hour ? (time.getHours() % 12 || 12) : time.getHours();
  const minutes = time.getMinutes().toString().padStart(2, '0');
  const ampm = is12Hour ? (time.getHours() >= 12 ? 'PM' : 'AM') : null;
  const dateStr = time.toLocaleDateString(locale, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  // The backdrop and the text on it are decided together (see
  // clockOverlayPaint). On the theme's own backdrop, `textSecondary`, not
  // `textMuted`, carries the second line; several themes' muted tone is far
  // too low-contrast to read across a room.
  const paint = clockOverlayPaint(theme, backdrop);
  const textColor = paint.text;
  const textMuted = paint.textSecondary;

  return (
    <div
      ref={bandRef}
      data-testid="fullscreen-photo-clock"
      className="absolute bottom-0 left-0 right-0 z-10 flex flex-col items-start px-10 pb-10"
      // The extra bottom padding keeps the text on the solid part of the
      // backdrop when it drifts down; a step, never a glide.
      style={{ background: paint.background, paddingBottom: wander ? 40 + WANDER_REACH_Y_PX : undefined }}
    >
      <div
        ref={textRef}
        data-testid="fullscreen-photo-clock-text"
        className="flex flex-col items-start"
        style={{ transform: wander ? `translate(${wander.x}px, ${wander.y}px)` : undefined }}
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
  /** The module's size in canvas pixels (registry `needsBoxSize`). */
  boxSize?: PictureBox;
}

export default function FullscreenPhotoModule({ config, timezone, fullscreenTheme, timeFormat, screenId, moduleId, boxSize }: FullscreenPhotoModuleProps) {
  const t = useTranslate('modules');
  const containerRef = useRef<HTMLDivElement>(null);
  const setupSentence = useSetupSentence();
  const surface = useModuleSurface();
  // The single picture that could not be loaded, so a new choice gets its own try.
  const [failedFile, setFailedFile] = useState<string | null>(null);

  const isSinglePhoto = isSinglePhotoMode(config);
  const playVideos = !!(screenId && moduleId);
  // A config without the key shows the clock, as the registry places it and
  // as the editor's toggle reads it.
  const showClock = config.showClock ?? true;

  // The photo list (the same media route as photo-slideshow); none for a single photo.
  const { data, error, items, batch, advance, controls, position, sources, activeLayer, layerReady, layerFailed } = usePhotoList('fullscreen-photo', config, { moduleId, playVideos, single: isSinglePhoto });

  // Midnight when nothing is set, unlike the other full-screen modules: see
  // photoThemeTokens.
  const theme = photoThemeTokens(config.theme, fullscreenTheme);
  // Photos are edge to edge, so the theme paints the frame around them: the
  // empty/loading screens, the letterbox bars an `objectFit: contain` photo
  // leaves behind, and the clock overlay's backdrop and text.
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
    if (failedFile === config.file) {
      // The file was deleted or cannot be read: say so instead of a bare ground.
      return (
        <div ref={containerRef} className="w-full h-full flex items-center justify-center" style={{ ...themeGround, color: theme.textSecondary }}>
          <NoPhotosYet theme={theme} t={t} title={t('image.unavailable')} cloudHint={t('fullscreen-photo.noPhotoSelectedHint')} />
        </div>
      );
    }
    const file = config.file;
    return (
      <div ref={containerRef} className="relative w-full h-full overflow-hidden" style={themeGround}>
        {config.kenBurns && <style>{KEN_BURNS_CSS}</style>}
        <SlideImage
          src={file}
          box={boxSize}
          active
          objectFit={config.objectFit}
          transition="none"
          fadeMs={0}
          kenBurns={config.kenBurns ?? false}
          onFailed={() => setFailedFile(file)}
        />
        {showClock && (
          <ClockOverlay theme={theme} backdrop={config} timezone={timezone} timeFormat={timeFormat} />
        )}
      </div>
    );
  }

  // A source that needs setting up (a missing key, a lapsed sign-in) says so
  // in the same place an empty one does, in the household's own language:
  // the error's own message is for developers and never goes on the wall.
  const needsSetup = data === null && error?.kind === 'setup';
  if ((data !== null && items.length === 0) || needsSetup) {
    // An empty library folder is filled from a phone; every other source's
    // fix is in the editor (a link, a folder, filters, search words or a
    // key), so it gets its own hint instead of phone-upload advice.
    const reason = emptyStateFor(normalizePhotoSource(config.photoSource) ?? defaultPhotoSource('library'));
    const cloudHint = needsSetup ? setupSentence(error!) : reason === 'addPhotos' ? null : t(CLOUD_HINT[reason]);
    return (
      <div
        ref={containerRef}
        className="w-full h-full flex items-center justify-center"
        style={{ ...themeGround, color: theme.textSecondary }}
      >
        <NoPhotosYet theme={theme} t={t} cloudHint={cloudHint} footer={needsSetup && surface !== 'editor' ? t('common.setup.finishInEditor') : undefined} />
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
        {error ? (
          // The first read failed and is being tried again: say so, as the
          // slideshow card does, rather than spin with no words.
          <p data-testid="module-not-updating" style={{ fontSize: 30, color: theme.textMuted }}>{t('common.notUpdating')}</p>
        ) : (
          <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: theme.border, borderTopColor: theme.text }} />
        )}
      </div>
    );
  }

  // Cut (never animate) when either neighbor of the transition is a video —
  // a transition would run two decoders at once, which Pi hardware can't
  // afford; Ken Burns (a CSS transform on a decoding surface) is skipped too.
  const videoAdjacent = sources.some((s) => s?.type === 'video');
  const transition = videoAdjacent ? 'none' : config.transition;

  const live = { motion: config.livePhotos ?? 'once', slideMs: config.intervalMs ?? DEFAULT_SLIDE_INTERVAL_MS };

  const renderLayer = (layer: LayerIndex) => (
    <SlideLayer
      item={sources[layer]}
      box={boxSize}
      active={activeLayer === layer}
      objectFit={config.objectFit}
      transition={transition}
      fadeMs={1200}
      kenBurns={(config.kenBurns ?? false) && !videoAdjacent}
      layerIndex={layer}
      playVideos={playVideos}
      loopVideo={batch.length === 1}
      maxVideoDurationMs={config.maxVideoDurationMs}
      onEnded={advance}
      onReady={() => layerReady(layer)}
      onFailed={() => layerFailed(layer)}
      live={live}
    />
  );

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden" style={themeGround}>
      <style>{KEN_BURNS_CSS}</style>

      {/* Layer 0 */}
      {renderLayer(0)}
      {/* Layer 1 */}
      {renderLayer(1)}

      <PhotoCredit item={sources[activeLayer]} box={boxSize} corner={showClock ? 'top' : 'bottom'} />

      {/* Clock overlay */}
      {showClock && (
        <ClockOverlay theme={theme} backdrop={config} timezone={timezone} timeFormat={timeFormat} />
      )}

      {/* Back, pause and next for a finger, over the clock while they are up.
          No swipe of its own: the photo is the whole screen, so a sideways
          swipe still changes screens. */}
      <PhotoControls
        controls={controls}
        position={position}
        album={photoAlbumName(normalizePhotoSource(config.photoSource), t('photoControls.allPictures'))}
        box={boxSize ?? { w: 1080, h: 1920 }}
        enabled={playVideos && config.interactive !== false}
        ownSwipe={false}
      />
    </div>
  );
}
