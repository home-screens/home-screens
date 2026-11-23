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
import { formatTimeOfDay } from '@/lib/timezone';
import { emptyStateFor, normalizePhotoSource, defaultPhotoSource, PHOTO_EMPTY_KEYS } from '@/lib/photo-source';
import PhotoCredit from '../shared/PhotoCredit';
import { PhotoControls, photoAlbumName } from '../shared/PhotoControls';
import { ModuleEmptyState, ModuleLoadingState, useSetupSentence } from '../ModuleStates';
import { FullscreenStateShell, fullscreenStateStyle } from '../shared/FullscreenStateShell';
import { useModuleSurface } from '../module-surface';

// ── Empty state ──────────────────────────────

function PhotoFrameIcon({ color }: { color: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke={color} style={{ width: 110, height: 110 }} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
    </svg>
  );
}

/**
 * The wall's "no photos yet" screen, in the words the slideshow card uses
 * (`PHOTO_EMPTY_KEYS`). Sized for the 1080x1920 canvas in plain px (the
 * canvas is scaled as a whole in the editor, so vw would lie there): readable
 * from the couch. A hint that names the phone (`{url}`) gets the hub's real
 * /remote address in a pill and a QR code a phone can scan; any other hint is
 * a fix in the editor, said as written.
 */
function NoPhotosYet({ theme, t, title, hint, footer }: { theme: FullscreenThemeTokens; t: TranslateFn; title: string; hint: string; footer?: string }) {
  const origin = useOrigin();
  const url = phoneSurfaceUrl('remote', origin);
  const [before, after] = hint.split('{url}');
  return (
    <div className="flex flex-col items-center text-center" style={{ gap: 24, padding: '0 80px', color: theme.textMuted }}>
      <PhotoFrameIcon color={theme.textMuted} />
      <p style={{ fontSize: 52, fontWeight: 600, lineHeight: 1.15, color: theme.text }}>{title}</p>
      {after === undefined ? (
        <>
          <p style={{ fontSize: 30, lineHeight: 1.35, maxWidth: 760 }}>{hint}</p>
          {footer && <p style={{ fontSize: 24, marginTop: 8 }}>{footer}</p>}
        </>
      ) : (
        <>
          {before.trim() && <p style={{ fontSize: 30, lineHeight: 1.35 }}>{before.trim()}</p>}
          <code
            data-testid="fullscreen-photo-remote-url"
            className="font-mono break-all"
            style={{ fontSize: 34, padding: '14px 30px', borderRadius: 999, background: theme.surface, color: theme.text, maxWidth: '100%' }}
          >
            {phoneSurfaceLabel('remote', origin)}
          </code>
          {after.trim() && <p style={{ fontSize: 30, lineHeight: 1.35 }}>{after.trim()}</p>}
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

  // "9:41 AM" splits into the big digits and a small day period, the way
  // the news clock does; 24-hour time is the digits alone.
  const clock = formatTimeOfDay(time, { timeFormat: householdTimeFormat(timeFormat, locale), locale });
  const gap = clock.lastIndexOf(' ');
  const digits = gap > 0 ? clock.slice(0, gap) : clock;
  const ampm = gap > 0 ? clock.slice(gap + 1) : null;
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
            {digits}
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

/** The canvas the states are sized for until the box size is known: a portrait 1080p wall. */
const DEFAULT_CANVAS: PictureBox = { w: 1080, h: 1920 };

export default function FullscreenPhotoModule({ config, style, timezone, fullscreenTheme, timeFormat, screenId, moduleId, boxSize }: FullscreenPhotoModuleProps) {
  const t = useTranslate('modules');
  const containerRef = useRef<HTMLDivElement>(null);
  const setupSentence = useSetupSentence();
  const surface = useModuleSurface();
  // The single picture that could not be loaded, so a new choice gets its own
  // try. Cleared when that picture paints after all: a read lost to a network
  // blip is tried again behind the sentence.
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

  // The pre-content states sit on the theme ground at a canvas-relative type
  // size, as every full-screen module's do.
  const stateStyle = fullscreenStateStyle(style, theme, boxSize ?? DEFAULT_CANVAS);

  if (isSinglePhoto) {
    if (!config.file) {
      // Mode is set but no photo chosen yet: the placeholder every module
      // that has nothing set up shows.
      return (
        <FullscreenStateShell theme={theme} containerRef={containerRef}>
          <ModuleEmptyState style={stateStyle} type="fullscreen-photo" message={t('fullscreen-photo.noPhotoSelectedHint')} />
        </FullscreenStateShell>
      );
    }
    const file = config.file;
    const failed = failedFile === file;
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
          onReady={() => setFailedFile((was) => (was === file ? null : was))}
          onFailed={() => setFailedFile(file)}
        />
        {failed && (
          // The file was deleted or cannot be read: say so instead of a bare
          // ground. Drawn over the picture's layer rather than in place of
          // it, because that layer is what keeps asking for the picture; with
          // it unmounted nothing was left to notice the picture had arrived.
          <div className="absolute inset-0 flex items-center justify-center" style={{ ...themeGround, color: theme.textSecondary, zIndex: 2 }}>
            <NoPhotosYet theme={theme} t={t} title={t('image.unavailable')} hint={t('fullscreen-photo.noPhotoSelectedHint')} />
          </div>
        )}
        {showClock && !failed && (
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
    // key), in the words the slideshow card uses.
    const keys = PHOTO_EMPTY_KEYS[emptyStateFor(normalizePhotoSource(config.photoSource) ?? defaultPhotoSource('library'))];
    return (
      <div
        ref={containerRef}
        className="w-full h-full flex items-center justify-center"
        style={{ ...themeGround, color: theme.textSecondary }}
      >
        <NoPhotosYet
          theme={theme}
          t={t}
          title={t(needsSetup ? 'common.photoEmpty.noPhotos' : keys.title)}
          hint={needsSetup ? setupSentence(error!) : t(keys.hint)}
          footer={needsSetup && surface !== 'editor' ? t('common.setup.finishInEditor') : undefined}
        />
      </div>
    );
  }

  if (data === null) {
    // Still on its way, or a first read that failed and is being tried again
    // ("Not updating right now"), as the slideshow card says it.
    return (
      <FullscreenStateShell theme={theme} containerRef={containerRef}>
        <ModuleLoadingState style={stateStyle} message={t('photo-slideshow.loading')} error={error} />
      </FullscreenStateShell>
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
