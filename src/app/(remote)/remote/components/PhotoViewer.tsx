'use client';

import { useCallback, useEffect, useRef, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from 'react';
import { FolderInput, Lock, Monitor, MonitorUp, Trash2, X } from 'lucide-react';
import { useFormattingLocale, useTranslate } from '@/i18n';
import type { MediaInventoryItem } from '@/lib/media-inventory';
import { displaySizedUrl, fitInside, serveUrlFor } from '@/lib/media-paths';
import { formatBytes } from '@/lib/format-bytes';
import { useBackGesture } from '../hooks/useBackGesture';
import { setToastFloor } from '../remote-toast';
import { REMOTE_ACCENT } from './chore-form-styles';
import { withAlpha } from '@/lib/hex-color';

/** What the panel under the picture says about one file, worked out by the tab. */
export interface PhotoFacts {
  /** The walls whose slideshow plays it, joined ("Kitchen and Hallway"). */
  showingOn: string | null;
  /** What a screen uses it for on its own ("Background of the Morning screen"). */
  usedAlone: string | null;
  /** Why it has to stay, when it has to. */
  note: string | null;
  canMove: boolean;
  canDelete: boolean;
}

interface PhotoViewerProps {
  items: readonly MediaInventoryItem[];
  index: number;
  onStep: (delta: 1 | -1) => void;
  onClose: () => void;
  /** Back was pressed: true when something open over the viewer took it (a
   *  sheet it opened closed), so the viewer stays. */
  onBackGesture?: () => boolean;
  facts: (item: MediaInventoryItem) => PhotoFacts;
  onMove: (item: MediaInventoryItem) => void;
  onDelete: (item: MediaInventoryItem) => void;
  onShowOnWall: (item: MediaInventoryItem) => void;
  busy: boolean;
}

/** How far a finger has to travel sideways before it counts as a swipe. */
const SWIPE_PX = 50;

/**
 * A picture no bigger than the phone shows it: the hub makes a copy sized to
 * the contained photo, so a 48-megapixel original never crosses the Wi-Fi.
 * GIFs, SVGs and videos go as they are.
 */
function viewerSrc(item: MediaInventoryItem): string {
  const url = serveUrlFor(item.path, { version: item.mtimeMs });
  if (item.kind !== 'image' || !item.width || !item.height || typeof window === 'undefined') return url;
  const dpr = window.devicePixelRatio || 1;
  const box = fitInside(item.width, item.height, { w: window.innerWidth * dpr, h: window.innerHeight * dpr });
  return displaySizedUrl(url, box) ?? url;
}

const ROUND_BUTTON: React.CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: 22,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#fff',
  background: 'rgba(255,255,255,0.1)',
  border: 'none',
  cursor: 'pointer',
};

const ACTION: React.CSSProperties = {
  flex: 1,
  minHeight: 48,
  borderRadius: 12,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  fontSize: 15,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

/**
 * One photo or video at full size, over everything, on black like every
 * phone's own photo viewer. Swipe sideways (or use the arrow keys) to go
 * through the folder in grid order. The panel says when it was added, how
 * big it is, which wall shows it, and offers what can be done with it; when
 * it has to stay, a line says why instead of offering a button that fails.
 */
const SIDEWAYS_QUERY = '(orientation: landscape) and (max-height: 520px)';

/** True on a phone held sideways: wide, and too short for a panel under the photo. */
function useSideways(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(SIDEWAYS_QUERY);
      query.addEventListener('change', onChange);
      return () => query.removeEventListener('change', onChange);
    },
    () => window.matchMedia(SIDEWAYS_QUERY).matches,
    () => false,
  );
}

export default function PhotoViewer({
  items,
  index,
  onStep,
  onClose,
  onBackGesture,
  facts,
  onMove,
  onDelete,
  onShowOnWall,
  busy,
}: PhotoViewerProps) {
  const t = useTranslate('remote');
  const tCore = useTranslate('core');
  const sideways = useSideways();
  const locale = useFormattingLocale();
  const item = items[index];
  const swipeRef = useRef<{ x: number; y: number } | null>(null);

  // Back closes the viewer (or first a sheet opened over it) instead of
  // leaving the remote, like every phone's own photo viewer.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onBackGestureRef = useRef(onBackGesture);
  onBackGestureRef.current = onBackGesture;
  const { release } = useBackGesture(() => {
    if (onBackGestureRef.current?.()) return true;
    onCloseRef.current();
    return false;
  });
  const close = useCallback(() => {
    release();
    onClose();
  }, [release, onClose]);

  // A toast sits just above the panel while the viewer is open, not on its buttons.
  const liftToastOver = useCallback((panel: HTMLDivElement | null) => {
    if (!panel) return;
    const lift = () => setToastFloor(panel.getBoundingClientRect().height);
    lift();
    const observer = new ResizeObserver(lift);
    observer.observe(panel);
    return () => {
      observer.disconnect();
      setToastFloor(null);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.target instanceof HTMLElement && e.target.closest('video, input, textarea')) return;
      if (e.key === 'ArrowRight') onStep(1);
      else if (e.key === 'ArrowLeft') onStep(-1);
      else if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onStep, close]);

  // The neighbours load while this one is looked at, so a swipe lands on a
  // picture that is already there.
  useEffect(() => {
    if (items.length < 2) return;
    for (const delta of [1, -1]) {
      const neighbour = items[(index + delta + items.length) % items.length];
      if (neighbour.kind === 'image') new Image().src = viewerSrc(neighbour);
    }
  }, [items, index]);

  if (!item) return null;
  const info = facts(item);

  const onPointerDown = (e: ReactPointerEvent) => {
    // A video's own controls take drags (scrubbing), and buttons take taps.
    const target = e.target as HTMLElement;
    swipeRef.current = target.closest('video, button, a') ? null : { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: ReactPointerEvent) => {
    const start = swipeRef.current;
    swipeRef.current = null;
    if (!start || items.length < 2) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.5) onStep(dx < 0 ? 1 : -1);
  };

  const added = new Date(item.mtimeMs);
  const sameYear = added.getFullYear() === new Date().getFullYear();
  const date = new Intl.DateTimeFormat(locale, sameYear
    ? { month: 'long', day: 'numeric' }
    : { month: 'long', day: 'numeric', year: 'numeric' }).format(added);
  const size = formatBytes(item.bytes, locale);
  const details = item.kind === 'video'
    ? t('photosTab.viewer.videoDetails', { size })
    : item.width && item.height
      ? `${item.width} × ${item.height} · ${size}`
      : size;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('photosTab.viewer.label')}
      data-testid="photo-viewer"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { swipeRef.current = null; }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 80,
        background: '#000',
        color: '#f5f5f5',
        display: 'flex',
        flexDirection: 'column',
        touchAction: 'pan-y',
        paddingTop: 'env(safe-area-inset-top)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 48, padding: '0 8px', flex: 'none' }}>
        <button type="button" onClick={close} aria-label={tCore('actions.close')} data-testid="photo-viewer-close" style={ROUND_BUTTON}>
          <X size={20} aria-hidden="true" />
        </button>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.78)' }} data-testid="photo-viewer-count">
          {t('photosTab.viewer.count', { n: index + 1, total: items.length })}
        </span>
        <span style={{ width: 44 }} />
      </div>

      {/* A phone turned sideways has no height to spare for a panel under the
          photo: the panel moves beside it and scrolls, and the photo keeps the
          whole height. */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: sideways ? 'row' : 'column' }}>
      <div style={{ flex: 1, minHeight: 0, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px 0', position: 'relative' }}>
        {item.kind === 'video' ? (
          <video
            key={item.path}
            src={serveUrlFor(item.path, { version: item.mtimeMs })}
            controls
            playsInline
            preload="metadata"
            data-testid="photo-viewer-video"
            style={{ maxWidth: '100%', maxHeight: '100%', display: 'block' }}
          />
        ) : (
          <img
            key={item.path}
            src={viewerSrc(item)}
            alt=""
            draggable={false}
            data-testid="photo-viewer-image"
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block', userSelect: 'none' }}
          />
        )}
      </div>

      <div
        ref={liftToastOver}
        data-testid="photo-viewer-panel"
        style={{
          flex: 'none',
          background: '#141414',
          padding: '16px 16px',
          ...(sideways
            ? {
                width: 'min(340px, 45%)',
                overflowY: 'auto',
                borderLeft: '1px solid #262626',
                borderRadius: '20px 0 0 0',
                paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
                paddingRight: 'max(16px, env(safe-area-inset-right))',
              }
            : {
                borderTop: '1px solid #262626',
                borderRadius: '20px 20px 0 0',
                paddingBottom: 'max(30px, env(safe-area-inset-bottom))',
              }),
        }}
      >
        <div data-testid="photo-viewer-facts">
          <b style={{ display: 'block', fontSize: 16, fontWeight: 700, color: '#f5f5f5' }}>
            {t('photosTab.viewer.added', { date })}
          </b>
          <span style={{ display: 'block', fontSize: 13, color: '#8a8a8a', marginTop: 3 }}>{details}</span>
        </div>

        {(info.showingOn || info.usedAlone) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            {info.showingOn && (
              <span data-testid="photo-viewer-showing" style={chip('rgba(34,197,94,0.14)', '#86efac')}>
                <Monitor size={14} aria-hidden="true" />
                {t('photosTab.showingOn', { walls: info.showingOn })}
              </span>
            )}
            {info.usedAlone && (
              <span data-testid="photo-viewer-used-alone" style={chip(withAlpha(REMOTE_ACCENT, 0.14), '#fcd34d')}>
                <Lock size={14} aria-hidden="true" />
                {info.usedAlone}
              </span>
            )}
          </div>
        )}

        {info.note && (
          <div
            data-testid="photo-viewer-note"
            style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 14, padding: 12, borderRadius: 12, background: '#1f1f1f', color: '#d4d4d4', fontSize: 13.5, lineHeight: 1.45 }}
          >
            <Lock size={18} style={{ color: '#fcd34d', marginTop: 2, flex: 'none' }} aria-hidden="true" />
            <span>{info.note}</span>
          </div>
        )}

        <button
          type="button"
          onClick={() => onShowOnWall(item)}
          disabled={busy}
          data-testid="photo-viewer-show"
          className="press-btn"
          style={{ ...ACTION, width: '100%', marginTop: 16, background: 'var(--hs-accent)', color: '#fff', border: 'none', opacity: busy ? 0.5 : 1 }}
        >
          <MonitorUp size={18} aria-hidden="true" />
          {t('photosTab.showOnWall')}
        </button>

        {(info.canMove || info.canDelete) && (
          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            {info.canMove && (
              <button
                type="button"
                onClick={() => onMove(item)}
                disabled={busy}
                data-testid="photo-viewer-move"
                className="press-scale"
                style={{ ...ACTION, background: '#2e2e2e', color: '#e5e5e5', fontWeight: 600, border: 'none', opacity: busy ? 0.5 : 1 }}
              >
                <FolderInput size={18} aria-hidden="true" />
                {t('photosTab.move')}
              </button>
            )}
            {info.canDelete && (
              <button
                type="button"
                onClick={() => onDelete(item)}
                disabled={busy}
                data-testid="photo-viewer-delete"
                className="press-scale"
                style={{ ...ACTION, background: 'transparent', color: '#f87171', border: '1px solid rgba(248,113,113,0.35)', opacity: busy ? 0.5 : 1 }}
              >
                <Trash2 size={18} aria-hidden="true" />
                {tCore('actions.delete')}
              </button>
            )}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

function chip(background: string, color: string): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    minHeight: 30,
    padding: '4px 12px 4px 10px',
    borderRadius: 15,
    background,
    color,
    fontSize: 13,
    fontWeight: 600,
  };
}
